import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema> & { $client: Pool };

const globalForDb = globalThis as unknown as { __db?: Database };

function instance(): Database {
  if (!globalForDb.__db) {
    const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
    globalForDb.__db = drizzle({ client: pool, schema, casing: "snake_case" });
  }
  return globalForDb.__db;
}

/**
 * Lazily-connected database handle. Nothing reads the environment or opens a
 * connection until the first query, so `next build` never needs secrets.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const real = instance();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
export type Db = Database;
export { schema };
