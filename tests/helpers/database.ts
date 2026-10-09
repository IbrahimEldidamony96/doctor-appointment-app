import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Isolated in-memory PostgreSQL. No credentials, network or application database access. */
export async function createTestDatabase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role authenticator nologin;
  `);
  const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
  const migrations = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  try {
    for (const migration of migrations) {
      const sql = await readFile(resolve(migrationsDirectory, migration), "utf8");
      await db.exec(sql);
    }
  } catch (error) {
    await db.close();
    throw error;
  }
  return db;
}
