import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { signPatientJwt, verifyPatientJwt } from "../lib/auth/patient-jwt";
import { isDoctorUser } from "../lib/auth/doctor-access";
import { getSafePatientRedirect } from "../lib/auth/redirect";
import { PATIENT_SESSION_MAX_AGE_SECONDS } from "../lib/auth/constants";
import { POST as sendOtpRoute } from "../app/api/otp/send/route";
import { POST as verifyOtpRoute } from "../app/api/otp/verify/route";

const secret = "test-patient-secret-at-least-32-bytes";
const patient = { patientId: "36a5b582-086c-4354-bcf1-08bfc14c37ac", phone: "+201234567890" };
const originalSecret = process.env.PATIENT_JWT_SECRET;
before(() => { process.env.PATIENT_JWT_SECRET = secret; });
after(() => {
  if (originalSecret === undefined) delete process.env.PATIENT_JWT_SECRET;
  else process.env.PATIENT_JWT_SECRET = originalSecret;
});

async function signClaims(claims: Record<string, unknown>, key = secret, alg = "HS256") {
  return new SignJWT(claims).setProtectedHeader({ alg })
    .sign(new TextEncoder().encode(key));
}

test("patient tokens authenticate only their signed, unmodified identity", async () => {
  const token = await signPatientJwt(patient);
  assert.deepEqual(await verifyPatientJwt(token), patient);
  assert.equal(await verifyPatientJwt(`${token.slice(0, -8)}abcdefgh`), null);
  assert.equal(await verifyPatientJwt("not-a-token"), null);
});

test("tokens require expiration, issued-at, issuer, audience, correct algorithm and identity", async () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...patient, iss: "clinic-patient-auth", aud: "clinic-patient", iat: now, exp: now + 60 };
  const invalidClaims: Record<string, unknown>[] = [
    { ...claims, exp: now - 1 },
    { ...claims, exp: undefined },
    { ...claims, iat: undefined },
    { ...claims, iss: "another-app" },
    { ...claims, aud: "doctor" },
    { ...claims, iat: now + 60 },
    { ...claims, exp: now + PATIENT_SESSION_MAX_AGE_SECONDS + 1 },
    { ...claims, patientId: "arbitrary-row" },
    { ...claims, phone: "201234567890" },
  ];
  for (const invalid of invalidClaims) {
    assert.equal(await verifyPatientJwt(await signClaims(invalid)), null);
  }
  assert.equal(await verifyPatientJwt(await signClaims(claims, "a-different-secret-at-least-32-bytes")), null);
  assert.equal(await verifyPatientJwt(await signClaims(claims, secret.repeat(2), "HS512")), null);
});

test("weak patient signing secrets fail closed", async () => {
  process.env.PATIENT_JWT_SECRET = "short";
  try {
    await assert.rejects(signPatientJwt(patient), /at least 32 bytes/);
    assert.equal(await verifyPatientJwt("invalid"), null);
  } finally {
    process.env.PATIENT_JWT_SECRET = secret;
  }
});

test("only explicitly allowlisted Clerk users can access doctor data", () => {
  assert.equal(isDoctorUser("user_doctor", " user_doctor, user_backup "), true);
  assert.equal(isDoctorUser("user_backup", " user_doctor, user_backup "), true);
  assert.equal(isDoctorUser("user_other", "user_doctor"), false);
  assert.equal(isDoctorUser("user_doctor", ""), false);
  assert.equal(isDoctorUser(null, "user_doctor"), false);
  assert.equal(isDoctorUser("user_doc", "user_doctor"), false);
});

test("login redirects reject external, protocol-relative and unimplemented routes", () => {
  for (const value of [null, undefined, "https://example.com", "//example.com", "/\\example.com", "/payment", "/dashboard", "/book?next=evil"]) {
    assert.equal(getSafePatientRedirect(value), "/book");
  }
  assert.equal(getSafePatientRedirect("/my-appointments"), "/my-appointments");
});

test("OTP routes reject malformed JSON and invalid phone/code before external work", async () => {
  for (const handler of [sendOtpRoute, verifyOtpRoute]) {
    const malformed = new NextRequest("http://localhost/api/otp", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{",
    });
    assert.equal((await handler(malformed)).status, 400);
    const text = new NextRequest("http://localhost/api/otp", {
      method: "POST", headers: { "content-type": "text/plain" }, body: "{}",
    });
    assert.equal((await handler(text)).status, 415);
  }
  for (const body of [{ phone: "+201234567890", code: "abcdef" }, { phone: "01234567890", code: "123456" }]) {
    const request = new NextRequest("http://localhost/api/otp/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await verifyOtpRoute(request)).status, 400);
  }
});

test("OTP database failures return 503 without messages or patient cookies", async () => {
  const overrides = {
    NEXT_PUBLIC_SUPABASE_URL: "https://auth-tests.invalid",
    SUPABASE_URL: "https://auth-tests.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    OTP_HASH_SECRET: "test-otp-secret-at-least-32-bytes-long",
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ code: "XX000", message: "Private database error" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  };
  try {
    for (const handler of [sendOtpRoute, verifyOtpRoute]) {
      const request = new NextRequest("http://localhost/api/otp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: patient.phone, code: "123456" }),
      });
      const response = await handler(request);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.ok(!(await response.text()).includes("Private database error"));
    }
    assert.equal(requests.length, 2);
    assert.ok(requests.every((url) => url.startsWith("https://auth-tests.invalid/rest/v1/rpc/")));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
