import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Reject private keys even if someone accidentally puts one in NEXT_PUBLIC_ env. */
function isPublicKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const fields = key.split(".");
    if (fields.length !== 3) return false;
    const payload = JSON.parse(atob(fields[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "anon";
  } catch { return false; }
}

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !isPublicKey(anonKey)) {
    throw new Error("Supabase browser client requires a publishable or anon key and URL");
  }
  return createClient<Database>(url, anonKey, { db: { schema: "clinic" } });
}
