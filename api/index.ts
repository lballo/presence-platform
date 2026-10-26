// Point d’entrée Vercel : toute l’API Hono/tRPC en une seule fonction serverless.
// Le serveur est pré-empaqueté par esbuild au build (voir vercel.json → build:vercel),
// car Vercel compile les fichiers TypeScript un par un sans résoudre les imports relatifs ESM.
import { handle } from "hono/vercel";
// @ts-ignore — fichier généré au build
import app from "./_server.mjs";

export default handle(app);
