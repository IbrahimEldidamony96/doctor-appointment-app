import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectEnvironment, isPublicSupabaseKey } from "../lib/configuration.mjs";
import { createBrowserClient } from "../lib/supabase/client";

const jwt = (role: string) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.test_signature`;

test("browser key classification accepts public keys and rejects private or malformed keys", () => {
  for (const key of ["sb_publishable_test_public_key", jwt("anon")]) assert.equal(isPublicSupabaseKey(key), true);
  for (const key of [undefined, "", "sb_secret_private_key", jwt("service_role"), jwt("authenticated"), "eyJ.not-json.signature", "arbitrary-key"]) {
    assert.equal(isPublicSupabaseKey(key), false);
  }
});

test("browser client refuses privileged keys before creating a Supabase client", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://configuration-tests.invalid";
  try {
    for (const key of ["sb_secret_private_key", jwt("service_role")]) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
      assert.throws(createBrowserClient, /publishable or anon key/);
    }
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});

test("configuration diagnostics identify missing providers and exposed keys without leaking values", () => {
  const key = "sb_secret_NEVER_PRINT_THIS_PRIVATE_VALUE";
  const result = inspectEnvironment({ NEXT_PUBLIC_SUPABASE_ANON_KEY: key, PATIENT_JWT_SECRET: "too-short" });
  assert.ok(result.errors.some((issue) => issue.startsWith("WHATSAPP_CLOUD_API_TOKEN:")));
  assert.ok(result.errors.some((issue) => issue.startsWith("PAYMOB_SECRET_KEY:")));
  assert.ok(result.errors.some((issue) => issue.includes("contains a private Supabase key")));
  assert.ok(result.errors.some((issue) => issue.includes("at least 32 bytes")));
  assert.ok(!JSON.stringify(result).includes(key));
});

test("production checks require approved templates, HTTPS and independent secrets", () => {
  const secret = "test-secret-at-least-thirty-two-bytes";
  const env = { NEXT_PUBLIC_APP_URL: "http://localhost:3000", PATIENT_JWT_SECRET: secret, OTP_HASH_SECRET: secret, CRON_SECRET: secret };
  const result = inspectEnvironment(env, { production: true });
  assert.ok(result.errors.some((issue) => issue.startsWith("WHATSAPP_AUTH_TEMPLATE_NAME:")));
  assert.ok(result.errors.some((issue) => issue.includes("HTTPS")));
  assert.ok(result.errors.some((issue) => issue.includes("independent secrets")));
});
