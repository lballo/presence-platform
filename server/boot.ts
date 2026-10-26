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
