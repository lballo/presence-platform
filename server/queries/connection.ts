import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../lib/env";
import * as schema from "../../db/schema";
import * as relations from "../../db/relations";

const fullSchema = { ...schema, ...relations };
let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    const local = /localhost|127\.0\.0\.1/.test(env.databaseUrl);
    const pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
    // Schéma Postgres dédié (ex. "presence" sur Supabase, pour cohabiter avec d'autres apps).
    // Nécessite une connexion en mode session (pas le pooler en mode transaction).
    if (env.dbSchema !== "public") {
      pool.on("connect", (c) => { c.query(`SET search_path TO "${env.dbSchema}", public`); });
    }
    instance = drizzle(pool, { schema: fullSchema });
  }
  return instance;
}
