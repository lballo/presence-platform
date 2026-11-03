import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { emailPreferences } from "../../db/schema";
import { env } from "./env";

/**
 * Les types de relance auxquels un membre peut s'inscrire ou non.
 * Les e-mails de compte (invitation, mot de passe) ne sont pas des relances : ils partent toujours.
 * Le marketing demande un accord : il est désactivé tant que le membre ne l'a pas activé.
 */
// « soon » : aucun e-mail de ce type ne part encore ; le choix du membre sera respecté dès le premier envoi.
export const EMAIL_CATEGORIES = {
  messages: { label: "Nouveaux messages", description: "Quand un membre vous écrit et que vous n’êtes pas connecté·e.", byDefault: true, soon: true },
  evenements: { label: "Événements", description: "Les rappels liés aux événements du réseau.", byDefault: true, soon: false },
  ruches: { label: "Annonces de ruche", description: "Les annonces des ruches dont vous faites partie.", byDefault: true, soon: true },
  resume: { label: "Résumé hebdomadaire", description: "Une fois par semaine, ce qui s’est passé dans le réseau.", byDefault: true, soon: true },
  coaching: { label: "Mon coaching", description: "Pour les clients du coaching individuel : l’invitation à réserver la séance de mi-parcours.", byDefault: true, soon: false },
  formations: { label: "Relances de formation", description: "Une nouvelle section ouverte, ou un rappel quand votre formation est en pause.", byDefault: true, soon: false },
  marketing: { label: "Actualités et offres", description: "Les nouveautés et les propositions de Laura.", byDefault: false, soon: false },
} as const;

export type EmailCategory = keyof typeof EMAIL_CATEGORIES;
export const isCategory = (c: string | undefined): c is EmailCategory => !!c && c in EMAIL_CATEGORIES;

/** Sans la clé d'envoi, ou sans la clé qui signe les liens de désinscription, rien ne part. */
export const emailReady = () => !!env.resendApiKey && !!env.privateDataKey;

/* ───────────── Préférences ───────────── */

export async function memberPreferences(memberId: number): Promise<Record<EmailCategory, boolean>> {
  const rows = await getDb().select().from(emailPreferences).where(eq(emailPreferences.memberId, memberId));
  const out = {} as Record<EmailCategory, boolean>;
  for (const key of Object.keys(EMAIL_CATEGORIES) as EmailCategory[]) out[key] = rows.find((r) => r.category === key)?.enabled ?? EMAIL_CATEGORIES[key].byDefault;
  return out;
}

export async function setPreference(memberId: number, category: EmailCategory, enabled: boolean) {
  await getDb().insert(emailPreferences).values({ memberId, category, enabled }).onConflictDoUpdate({ target: [emailPreferences.memberId, emailPreferences.category], set: { enabled, updatedAt: new Date() } });
}

export async function wantsEmail(memberId: number, category: EmailCategory): Promise<boolean> {
  const [row] = await getDb().select().from(emailPreferences).where(and(eq(emailPreferences.memberId, memberId), eq(emailPreferences.category, category))).limit(1);
  return row?.enabled ?? EMAIL_CATEGORIES[category].byDefault;
}

/* ───────────── Désinscription : un lien signé, utilisable sans se connecter ───────────── */

export function unsubscribeToken(memberId: number, category: EmailCategory): string {
  return createHmac("sha256", env.privateDataKey).update(`desinscription:${memberId}:${category}`).digest("base64url").slice(0, 32);
}

export function validUnsubscribe(memberId: number, category: string | undefined, token: string | undefined): category is EmailCategory {
  if (!env.privateDataKey || !isCategory(category) || !token) return false;
  const want = Buffer.from(unsubscribeToken(memberId, category));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

const unsubscribeQuery = (memberId: number, category: EmailCategory) => `m=${memberId}&c=${category}&t=${unsubscribeToken(memberId, category)}`;
export const unsubscribePage = (memberId: number, category: EmailCategory) => `${env.appUrl}/desinscription?${unsubscribeQuery(memberId, category)}`;

/** Le clic direct depuis la messagerie. */
export async function unsubscribeFromLink(m: string | undefined, c: string | undefined, t: string | undefined): Promise<boolean> {
  const memberId = Number(m);
  if (!Number.isInteger(memberId) || !validUnsubscribe(memberId, c, t)) return false;
  await setPreference(memberId, c, false);
  return true;
}

/* ───────────── Mise en page ───────────── */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Remplace {{prenom}}, {{section}}, {{lecon}}, {{formation}}. Une variable inconnue disparaît. */
export const fillTemplate = (t: string, values: Record<string, string>) => t.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => values[k] ?? "");

export function renderEmail(i: { body: string; cta?: { label: string; href: string }; reason: string; unsubscribeUrl: string }): { html: string; text: string } {
  const paragraphs = i.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#141211">${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  const button = i.cta ? `<p style="margin:24px 0"><a href="${esc(i.cta.href)}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#A92B2A;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${esc(i.cta.label)}</a></p>` : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#F7F5F2;font-family:Helvetica,Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ECE8E4;border-radius:18px"><tr><td style="padding:28px"><p style="margin:0 0 20px;font-family:Georgia,serif;font-size:22px;color:#141211"><span style="color:#A92B2A">●</span> Présence</p>${paragraphs}${button}<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #ECE8E4;font-size:12.5px;line-height:1.5;color:#78716C">${esc(i.reason)}<br><a href="${esc(i.unsubscribeUrl)}" style="color:#78716C">Ne plus recevoir ces e-mails</a> · Laura Ballo, contact@lauraballo.com</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${i.body.trim()}\n${i.cta ? `\n${i.cta.label} : ${i.cta.href}\n` : ""}\n--\n${i.reason}\nNe plus recevoir ces e-mails : ${i.unsubscribeUrl}\nLaura Ballo, contact@lauraballo.com`;
  return { html, text };
}

/* ───────────── Envoi ───────────── */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let queue: Promise<void> = Promise.resolve();
const GAP_MS = 600; // Resend accepte environ 2 envois par seconde

export async function sendEmail(m: { to: string; subject: string; html: string; text: string; memberId: number; category: EmailCategory; idempotencyKey?: string }): Promise<string> {
  queue = queue.then(() => sleep(GAP_MS));
  await queue;
  const res = await fetch(`${env.emailApiBase}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json", ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey.slice(0, 256) } : {}) },
    body: JSON.stringify({
      from: env.emailFrom, to: m.to, reply_to: env.emailReplyTo, subject: m.subject, html: m.html, text: m.text,
      // Désinscription en un clic, directement depuis la messagerie
      headers: { "List-Unsubscribe": `<${env.appUrl}/api/email/desinscription?${unsubscribeQuery(m.memberId, m.category)}>, <mailto:contact@lauraballo.com?subject=D%C3%A9sinscription>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
  const data = (await res.json()) as { id?: string };
  return data.id ?? "";
}
