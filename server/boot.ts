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
    CURRENT_MEMBER_ID: env.currentMemberId,
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

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

app.use("/api/trpc/*", async (c) =>
  fetchRequestHandler({ endpoint: "/api/trpc", req: c.req.raw, router: appRouter, createContext })
);
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

// Serveur Node autonome (Render, VPS…). Sur Vercel, c’est api/index.ts qui expose l’app.
if (env.isProduction && !process.env.VERCEL) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);
  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => console.log(`Présence : http://localhost:${port}/`));
}
