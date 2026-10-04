import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client — full access, bypasses RLS entirely.
 *
 * Use ONLY inside Server Actions and Route Handlers. Never import
 * this file from a Client Component — the "server-only" import
 * above will throw a build error if you accidentally do.
 *
 * Authorization is your job here: check the Clerk session (doctor)
 * or verify the patient JWT (patient) before calling this, and scope
 * patient queries with `.eq('patient_id', patientId)` yourself.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service role environment variables");
  }

  return createClient<Database>(url, serviceRoleKey, {
    db: { schema: "clinic" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
