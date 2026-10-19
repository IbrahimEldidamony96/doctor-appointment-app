import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { signPatientJwt, verifyPatientJwt } from "../lib/auth/patient-jwt";
import { getClinicActorForIdentity } from "../lib/auth/clinic-actor";
import { getSafePatientRedirect } from "../lib/auth/redirect";
import { getLoginDestination, safeLoginRedirect } from "../lib/auth/safe-redirect";
import { PATIENT_SESSION_COOKIE, PATIENT_SESSION_MAX_AGE_SECONDS } from "../lib/auth/constants";
import { POST as sendOtpRoute } from "../app/api/otp/send/route";
import { POST as verifyOtpRoute } from "../app/api/otp/verify/route";
import proxy from "../proxy";

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
  const claims = { ...patient, iss: "clinic-whatsapp-auth", aud: "clinic-user", iat: now, exp: now + 60 };
  assert.deepEqual(await verifyPatientJwt(await signClaims(claims)), patient);
  const invalidClaims: Record<string, unknown>[] = [
    { ...claims, exp: now - 1 },
    { ...claims, exp: undefined },
    { ...claims, iat: undefined },
    { ...claims, iss: "another-app" },
    { ...claims, iss: "clinic-patient-auth", aud: "clinic-patient" },
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
  assert.deepEqual(await verifyPatientJwt(await signClaims({ ...claims, role: "doctor", isOwner: true })), patient,
    "session claims never supply clinic permissions");
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

test("shared WhatsApp sessions grant clinic access only for a current active staff phone", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staff-auth-tests.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  const originalFetch = globalThis.fetch;
  const staffId = "c65ecc68-9e58-4c81-86c3-d7c371e930a5";
  let staff: { id: string; phone: string; role: string; is_owner: boolean; is_active: boolean } | null = null;
  let databaseFailure = false;
  const requests: URL[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://staff-auth-tests.invalid");
    assert.equal(url.pathname, "/rest/v1/staff_accounts");
    assert.equal(url.searchParams.get("phone"), `eq.${patient.phone}`);
    assert.equal(url.searchParams.get("is_active"), "eq.true");
    requests.push(url);
    const matches = staff?.is_active && staff.phone === patient.phone;
    return new Response(JSON.stringify(databaseFailure ? { message: "Private database error" } : matches ? [staff] : []), {
      status: databaseFailure ? 400 : 200, headers: { "content-type": "application/json" },
    });
  };
  try {
    assert.equal(await getClinicActorForIdentity(null), null);
    assert.equal(requests.length, 0);
    const identity = await verifyPatientJwt(await signPatientJwt(patient));
    assert.equal(await getClinicActorForIdentity(identity), null, "unapproved phone remains a patient");
    staff = { id: staffId, phone: patient.phone, role: "doctor", is_owner: true, is_active: true };
    assert.deepEqual(await getClinicActorForIdentity(identity), {
      id: staffId, phone: patient.phone, role: "doctor", isOwner: true,
    });
    staff.is_active = false;
    assert.equal(await getClinicActorForIdentity(identity), null, "disabling staff revokes an existing session immediately");
    staff.is_active = true;
    staff.role = "nurse";
    staff.is_owner = false;
    assert.deepEqual(await getClinicActorForIdentity(identity), {
      id: staffId, phone: patient.phone, role: "nurse", isOwner: false,
    });
    staff.role = "administrator";
    assert.equal(await getClinicActorForIdentity(identity), null, "unknown database roles fail closed");
    staff.role = "doctor";
    databaseFailure = true;
    await assert.rejects(getClinicActorForIdentity(identity), /Clinic membership unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("login redirects reject external, protocol-relative and unimplemented routes", () => {
  for (const value of [null, undefined, "https://example.com", "//example.com", "/\\example.com", "/payment", "/dashboard", "/book?next=evil"]) {
    assert.equal(getSafePatientRedirect(value), "/book");
  }
  assert.equal(getSafePatientRedirect("/my-appointments"), "/my-appointments");
});

test("shared login preserves valid destinations while rejecting URL normalization attacks", () => {
  for (const value of [null, undefined, "https://example.com", "//example.com", "/\\example.com", "/dashboardevil", "/dashboard/../login", "/dashboard/%2e%2e/login", "/dashboard\\settings"]) {
    assert.equal(safeLoginRedirect(value), "/book", String(value));
  }
  for (const value of ["/dashboard", "/dashboard/appointments", "/dashboard/calendar", "/book", "/my-appointments", "/payment", "/profile"]) {
    assert.equal(safeLoginRedirect(value), value);
  }
  assert.equal(getLoginDestination(null, false), "/book");
  assert.equal(getLoginDestination(null, true), "/dashboard");
  assert.equal(safeLoginRedirect("/dashboard/calendar?date=2026-10-18"), "/dashboard/calendar?date=2026-10-18");
  assert.equal(getLoginDestination("/dashboard/calendar", false), "/doctor-access-denied");
  assert.equal(getLoginDestination("/dashboard/calendar", true), "/dashboard/calendar");
  assert.equal(getLoginDestination("/my-appointments", true), "/my-appointments");
});

test("protected routes require a signed shared session and preserve the requested dashboard page", async () => {
  const destination = "/dashboard/calendar?date=2026-10-19";
  for (const cookie of [undefined, `${PATIENT_SESSION_COOKIE}=invalid`, "patient_session=old-session"]) {
    const response = await proxy(new NextRequest(`https://clinic.invalid${destination}`, {
      headers: cookie ? { cookie } : undefined,
    }));
    const loginUrl = new URL(response.headers.get("location")!);
    assert.equal(loginUrl.origin, "https://clinic.invalid");
    assert.equal(loginUrl.pathname, "/login");
    assert.equal(loginUrl.searchParams.get("redirect"), destination);
  }
  const token = await signPatientJwt(patient);
  const response = await proxy(new NextRequest(`https://clinic.invalid${destination}`, {
    headers: { cookie: `${PATIENT_SESSION_COOKIE}=${token}` },
  }));
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-middleware-next"), "1",
    "identity is accepted; dashboard pages and mutations must independently authorize staff");
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
    WHATSAPP_AUTH_TEMPLATE_NAME: "test_authentication_template",
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

test("a membership lookup failure after valid OTP cannot issue a shared session", async () => {
  const overrides = {
    NEXT_PUBLIC_SUPABASE_URL: "https://membership-auth-tests.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    OTP_HASH_SECRET: "test-otp-secret-at-least-32-bytes-long",
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  const originalFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://membership-auth-tests.invalid");
    paths.push(url.pathname);
    if (url.pathname === "/rest/v1/rpc/verify_otp") {
      return Response.json({ success: true });
    }
    if (url.pathname === "/rest/v1/patients") {
      assert.equal(url.searchParams.get("phone"), `eq.${patient.phone}`);
      return Response.json([{ id: patient.patientId, phone: patient.phone }]);
    }
    assert.equal(url.pathname, "/rest/v1/staff_accounts");
    return Response.json({ code: "XX000", message: "Private membership lookup failure" }, { status: 400 });
  };
  try {
    const response = await verifyOtpRoute(new NextRequest("https://clinic.invalid/api/otp/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: patient.phone, code: "123456", redirectTo: "/dashboard" }),
    }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), { error: "otp_service_unavailable" });
    assert.deepEqual(paths, ["/rest/v1/rpc/verify_otp", "/rest/v1/patients", "/rest/v1/staff_accounts"]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
