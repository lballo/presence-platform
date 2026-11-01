import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();

// 500 Mo : les vidéos passent en data URL (hérité de PresenceAI)
app.use(bodyLimit({ maxSize: 500 * 1024 * 1024 }));

// Diagnostic : état de la configuration (sans jamais exposer les valeurs).
app.get("/api/health", async (c) => {
  const config = {
    DATABASE_URL: !!env.databaseUrl,
    DB_SCHEMA: process.env.DB_SCHEMA ?? "(public)",
    GEMINI_API_KEY: !!env.geminiApiKey,
    SUPABASE_STORAGE: !!(env.supabaseUrl && env.supabaseServiceKey),
    SUPABASE_AUTH: !!(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey),
    APP_URL: env.appUrl,
    MEMBERSHIP_URL: !!env.membershipUrl,
    NOTION_TOKEN: !!env.notionToken,
    PRIVATE_DATA_KEY: !!env.privateDataKey,
    RESEND_API_KEY: !!env.resendApiKey,
    runtime: process.env.VERCEL ? "vercel" : process.env.RENDER ? "render" : "node",
  };
  if (!env.databaseUrl) return c.json({ ok: false, error: "DATABASE_URL manquante", config }, 500);
  try {
    const { getDb } = await import("./queries/connection");
    const { members } = await import("../db/schema");
    const rows = await getDb().select({ id: members.id }).from(members).limit(1);
    return c.json({ ok: true, members: rows.length, config });
  } catch (e) {
    const cause = e instanceof Error && e.cause instanceof Error ? ` — ${e.cause.message}` : "";
    return c.json({ ok: false, error: (e instanceof Error ? e.message : String(e)) + cause, config }, 500);
  }
});

// Configuration publique lue par le navigateur au démarrage (la clé anon est faite pour être publique).
app.get("/api/config", (c) => c.json({ supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey, membershipUrl: env.membershipUrl, appUrl: env.appUrl }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// Désinscription en un clic depuis la messagerie (en-tête List-Unsubscribe-Post) : sans compte, le lien signé suffit.
app.post("/api/email/desinscription", async (c) => {
  const { unsubscribeFromLink } = await import("./lib/email");
  const ok = await unsubscribeFromLink(c.req.query("m"), c.req.query("c"), c.req.query("t"));
  return ok ? c.text("Désinscription enregistrée.") : c.text("Lien invalide.", 400);
});

// Les tests HTML : ce chemin ne sert qu'eux, chacun isolé par ses en-têtes (voir testHost.ts).
app.get("/api/test-html/:id", async (c) => {
  const { serveTest } = await import("./lib/testHost");
  return serveTest(Number(c.req.param("id")), c.req.query("t"));
});

app.use("/api/trpc/*", async (c) =>
  fetchRequestHandler({ endpoint: "/api/trpc", req: c.req.raw, router: appRouter, createContext })
);
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

// Serveur Node autonome (Render, VPS…). Sur Vercel, c’est api/index.ts qui expose l’app.
if (env.isProduction && !process.env.VERCEL) {
  const { serve } = await import("@hono/node-server");
  const { indexWith, serveStaticFiles } = await import("./lib/vite");
  const { eventShareTags } = await import("./lib/eventShare");
  // Aperçu de partage (LinkedIn…) : calculé ici, car ces robots n'exécutent pas l'application.
  app.get("/e/:slug", async (c) => {
    const share = await eventShareTags(c.req.param("slug"));
    if (!share.indexable) c.header("X-Robots-Tag", "noindex");
    return c.html(indexWith(share.head));
  });
  serveStaticFiles(app);
  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => console.log(`Présence : http://localhost:${port}/`));
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
