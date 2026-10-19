import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const [phone, rawName, ...extra] = process.argv.slice(2);
const displayName = rawName?.trim();
if (extra.length || !/^\+[1-9][0-9]{7,14}$/.test(phone ?? "")
  || !displayName || displayName.length < 2 || displayName.length > 100) {
  console.error('Usage: npm run bootstrap:doctor -- +201234567890 "Doctor name"');
  process.exitCode = 1;
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before running setup.");
    process.exitCode = 1;
  } else {
    try {
      const client = createClient(url, key, {
        db: { schema: "clinic" },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.rpc("bootstrap_clinic_owner", {
        p_phone: phone, p_display_name: displayName,
      });
      if (error || typeof data !== "string" || !data) {
        if (error?.message?.includes("CLINIC_OWNER_ALREADY_EXISTS")) {
          console.error("A clinic owner already exists. Add additional staff from the dashboard.");
        } else if (error?.message?.includes("INVALID_OWNER_INPUT")) {
          console.error("Use an international WhatsApp number and a name between 2 and 100 characters.");
        } else {
          console.error("Owner setup failed. Check the database migration and service role configuration.");
        }
        process.exitCode = 1;
      } else {
        console.log("Clinic owner created. Sign in with that WhatsApp number to open the dashboard.");
      }
    } catch {
      console.error("Owner setup failed. Check the Supabase URL and network connection.");
      process.exitCode = 1;
    }
  }
}
