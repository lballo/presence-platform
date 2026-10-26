// Point d’entrée Vercel : toute l’API Hono/tRPC en une seule fonction serverless.
import { handle } from "hono/vercel";
import app from "../server/boot";

export default handle(app);
