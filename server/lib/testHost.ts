import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { tests } from "../../db/schema";
import { env } from "./env";
import { downloadBuffer } from "./storage";

/**
 * Les tests HTML déposés sur le réseau sont servis par un seul chemin, /api/test-html/:id, toujours isolés :
 * - l'en-tête « sandbox » leur retire l'origine de l'application, même si quelqu'un ouvre le lien hors du cadre :
 *   ils ne peuvent lire ni la session, ni le stockage du navigateur, ni la page qui les affiche ;
 * - « connect-src 'none' » leur interdit d'appeler l'API ou tout autre serveur ;
 * - ils ne peuvent ni changer la page de l'application, ni ouvrir de fenêtre.
 * Le lien est signé : une iframe ne peut pas envoyer le jeton de connexion.
 */
export const TEST_CSP = [
  "sandbox allow-scripts allow-forms allow-modals allow-downloads",
  "default-src 'none'",
  "script-src 'unsafe-inline' https:",
  "style-src 'unsafe-inline' https:",
  "img-src https: data: blob:",
  "font-src https: data:",
  "media-src https: data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");

const SECURITY_HEADERS = { "Content-Security-Policy": TEST_CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" };

const LIFETIME_MS = 4 * 60 * 60 * 1000;
const sign = (body: string) => createHmac("sha256", env.privateDataKey).update(`test-html:${body}`).digest("base64url");

/** Sans clé de chiffrement, aucun lien n'est signé : le test ne s'ouvre pas. */
export function testToken(testId: number, memberId: number, preview = false): string | null {
  if (!env.privateDataKey) return null;
  const body = `${testId}.${memberId}.${preview ? 1 : 0}.${Date.now() + LIFETIME_MS}`;
  return `${body}.${sign(body)}`;
}

export function hostedSrc(testId: number, memberId: number, preview = false): string | null {
  const token = testToken(testId, memberId, preview);
  return token ? `/api/test-html/${testId}?t=${encodeURIComponent(token)}` : null;
}

export function readTestToken(token: string | undefined, testId: number): { memberId: number; preview: boolean } | null {
  if (!token || !env.privateDataKey) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [id, memberId, preview, exp, signature] = parts;
  const want = Buffer.from(sign(`${id}.${memberId}.${preview}.${exp}`));
  const got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(id) !== testId || !(Number(exp) > Date.now())) return null;
  return { memberId: Number(memberId), preview: preview === "1" };
}

/** Le contrat de docs/integrer-un-test.md : le fichier envoie-t-il son résultat ? */
export const hasResultBlock = (html: string) => html.includes("presence:test-result");
/** Un fichier déposé par erreur (texte, PDF renommé…) est refusé : il n'afficherait rien. */
export const looksLikeHtml = (html: string) => /<(!doctype\s+html|html|head|body|script|form|div|main|section)\b/i.test(html.slice(0, 200000));

/**
 * Ajouté en tête de chaque test : un test écrit pour une page ordinaire utilise souvent le stockage du navigateur,
 * interdit ici. Il reçoit un stockage en mémoire qui dure le temps du passage. Le cadre s'ajuste aussi à sa hauteur.
 * Une page dont la taille dépend de celle du cadre (100vh et une marge) grandirait sans fin : à la troisième hausse identique, on s'arrête, et elle défile dans son cadre.
 */
const BOOTSTRAP = `<script>(function(){
function memory(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x")}catch(e){Object.defineProperty(window,n,{value:memory(),configurable:true})}});
var last=0,step=0,same=0,stop=false;function tell(){var b=document.body;if(stop||!b)return;var s=getComputedStyle(b),h=Math.ceil(b.scrollHeight+parseFloat(s.marginTop)+parseFloat(s.marginBottom)),d=h-last;if(!h||Math.abs(d)<=4)return;same=d>0&&d===step?same+1:0;step=d;if(same>=3){stop=true;return}last=h;parent.postMessage({type:"presence:test-height",height:h},"*")}
addEventListener("load",tell);
document.addEventListener("DOMContentLoaded",function(){tell();if(window.ResizeObserver){var o=new ResizeObserver(tell);o.observe(document.body);o.observe(document.documentElement)}});
})();</script>`;

/** Le script s'insère avant tout le code du test. */
export function withBootstrap(html: string): string {
  const at = html.match(/<head[^>]*>/i) ?? html.match(/<html[^>]*>/i) ?? html.match(/<!doctype[^>]*>/i);
  if (!at || at.index === undefined) return BOOTSTRAP + html;
  const end = at.index + at[0].length;
  return html.slice(0, end) + BOOTSTRAP + html.slice(end);
}

const refuse = (status: number, text: string) => new Response(text, { status, headers: { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });

export async function serveTest(testId: number, token: string | undefined): Promise<Response> {
  if (!Number.isInteger(testId)) return refuse(404, "Ce test n’existe pas.");
  const access = readTestToken(token, testId);
  if (!access) return refuse(403, "Ce lien n’est plus valable. Rouvrez le test depuis Mes ressources.");
  const [test] = await getDb().select({ path: tests.htmlPath, status: tests.status, archivedAt: tests.archivedAt }).from(tests).where(eq(tests.id, testId)).limit(1);
  if (!test?.path || test.archivedAt || (test.status !== "publie" && !access.preview)) return refuse(404, "Ce test n’est pas disponible.");
  const data = await downloadBuffer("testFile", test.path);
  if (!data) return refuse(404, "Le fichier de ce test est introuvable.");
  return new Response(withBootstrap(data.toString("utf8")), { status: 200, headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}
