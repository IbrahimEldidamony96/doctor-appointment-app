import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Uses service_role and bypasses RLS: every caller MUST authorize & scope its query. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role environment variables");
  return createClient<Database>(url, key, {
    db: { schema: "clinic" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
