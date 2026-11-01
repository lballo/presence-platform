import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

type App = Hono<{ Bindings: HttpBindings }>;

const distPath = () => path.resolve(import.meta.dirname, "../dist/public");

/** La page de l'application, avec les balises de partage propres à une page. */
export function indexWith(head: string): string {
  const html = fs.readFileSync(path.resolve(distPath(), "index.html"), "utf-8");
  return html.replace(/<title>[^<]*<\/title>/, "").replace("</head>", `${head}\n  </head>`);
}

export function serveStaticFiles(app: App) {
  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath(), "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
