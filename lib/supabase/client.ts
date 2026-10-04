import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Anon-key client — safe to use in Client Components.
 *
 * With RLS enabled and no anon/authenticated policies (see
 * 002_enable_rls.sql), this client currently cannot read or write
 * any clinic table. It exists so the pattern is in place if you
 * later open a specific public policy (e.g. published reviews).
 */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient<Database>(url, anonKey, {
    db: { schema: "clinic" },
  });
}
