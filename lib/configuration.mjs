/** Classifies a Supabase public API key; this does not verify JWT signatures. */
export function isPublicSupabaseKey(key) {
  if (typeof key !== "string") return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const payload = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).role === "anon";
  } catch {
    return false;
  }
}

/** Returns variable names and actionable errors only, never credential values. */
export function inspectEnvironment(env, { production = false } = {}) {
  const errors = [];
  const warnings = [];
  const requireValue = (name) => {
    if (typeof env[name] !== "string" || !env[name].trim()) {
      errors.push(`${name}: missing`);
      return false;
    }
    return true;
  };

  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "DOCTOR_CLERK_USER_IDS",
    "WHATSAPP_CLOUD_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "PAYMOB_SECRET_KEY",
    "PAYMOB_PUBLIC_KEY", "PAYMOB_INTEGRATION_ID", "PAYMOB_HMAC_SECRET", "NEXT_PUBLIC_APP_URL"]) {
    requireValue(name);
  }

  for (const name of ["PATIENT_JWT_SECRET", "OTP_HASH_SECRET", "CRON_SECRET"]) {
    if (requireValue(name) && new TextEncoder().encode(env[name]).byteLength < 32) {
      errors.push(`${name}: must contain at least 32 bytes`);
    }
  }
  const secretNames = ["PATIENT_JWT_SECRET", "OTP_HASH_SECRET", "CRON_SECRET"];
  for (let i = 0; i < secretNames.length; i++) {
    for (let j = i + 1; j < secretNames.length; j++) {
      if (env[secretNames[i]] && env[secretNames[i]] === env[secretNames[j]]) {
        errors.push(`${secretNames[i]} and ${secretNames[j]}: use independent secrets`);
      }
    }
  }

  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && typeof value === "string" && value.startsWith("sb_secret_")) {
      errors.push(`${name}: contains a private Supabase key; remove it and rotate any exposed key`);
    }
  }
  const publicKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (publicKey && !isPublicSupabaseKey(publicKey)) {
    errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY: must be a publishable or legacy anon key");
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY && isPublicSupabaseKey(env.SUPABASE_SERVICE_ROLE_KEY)) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY: requires a private secret or service-role key");
  }

  if (env.DOCTOR_CLERK_USER_IDS && !env.DOCTOR_CLERK_USER_IDS.split(",").every((id) => /^user_[A-Za-z0-9]+$/.test(id.trim()))) {
    errors.push("DOCTOR_CLERK_USER_IDS: use comma-separated Clerk user IDs");
  }
  if (env.PAYMOB_INTEGRATION_ID && !/^[1-9]\d*$/.test(env.PAYMOB_INTEGRATION_ID)) {
    errors.push("PAYMOB_INTEGRATION_ID: must be a positive integer");
  }
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL"]) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || (production && url.protocol !== "https:")) {
        throw new Error("Invalid origin");
      }
    } catch {
      errors.push(`${name}: requires a valid ${production ? "HTTPS " : "HTTP(S) "}origin without credentials, paths or query parameters`);
    }
  }
  if (production) {
    for (const name of ["WHATSAPP_AUTH_TEMPLATE_NAME", "WHATSAPP_REMINDER_TEMPLATE_NAME", "WHATSAPP_DOCTOR_TEMPLATE_NAME"]) {
      requireValue(name);
    }
  }

  if (env.RESEND_API_KEY || env.RESEND_FROM_EMAIL) {
    requireValue("RESEND_API_KEY");
    if (requireValue("RESEND_FROM_EMAIL") && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.RESEND_FROM_EMAIL)) {
      errors.push("RESEND_FROM_EMAIL: use an email address on a verified sender domain");
    }
    warnings.push("RESEND_FROM_EMAIL: verify the sender domain in Resend before enabling email delivery");
  } else {
    warnings.push("RESEND_API_KEY / RESEND_FROM_EMAIL: optional email delivery is not configured");
  }

  return { errors, warnings };
}
