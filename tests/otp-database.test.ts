import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/database";

const goodHash = "a".repeat(64);
const wrongHash = "b".repeat(64);

test("OTP transactions enforce cooldown, attempt limits, expiry and one-time use", async () => {
  const db = await createTestDatabase();
  try {
    const phone = "+201234567890";
    async function issue() {
      const result = await db.query<{ result: { success: boolean; id?: string; reason?: string; retry_after?: number } }>(
        "select clinic.issue_otp($1, $2) as result", [phone, goodHash]);
      return result.rows[0].result;
    }
    async function verify(hash = goodHash) {
      const result = await db.query<{ result: { success: boolean; reason?: string } }>(
        "select clinic.verify_otp($1, $2) as result", [phone, hash]);
      return result.rows[0].result;
    }
    assert.deepEqual(await verify(), { success: false, reason: "not_found" });
    const first = await issue();
    assert.equal(first.success, true);
    assert.ok(first.id);
    const cooldown = await issue();
    assert.equal(cooldown.reason, "too_many_requests");
    assert.ok((cooldown.retry_after ?? 0) > 0);
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(await verify(wrongHash), { success: false, reason: "invalid_code" });
    }
    assert.deepEqual(await verify(), { success: false, reason: "too_many_attempts" });
    const attempts = await db.query<{ attempts: number }>("select attempts from clinic.otp_codes where id = $1", [first.id]);
    assert.equal(attempts.rows[0].attempts, 5);

    await db.query("update clinic.otp_codes set created_at = now() - interval '61 seconds' where phone = $1", [phone]);
    assert.equal((await issue()).success, true);
    const simultaneous = await Promise.all([verify(), verify()]);
    assert.equal(simultaneous.filter((result) => result.success).length, 1);
    assert.deepEqual(await verify(), { success: false, reason: "not_found" });
    // Verification retains the send history: it cannot bypass the cooldown.
    assert.equal((await issue()).reason, "too_many_requests");

    await db.query("update clinic.otp_codes set created_at = created_at - interval '61 seconds' where phone = $1", [phone]);
    const expired = await issue();
    await db.query("update clinic.otp_codes set expires_at = now() - interval '1 second' where id = $1", [expired.id]);
    assert.deepEqual(await verify(), { success: false, reason: "expired" });
  } finally {
    await db.close();
  }
});

test("OTP hourly and daily budgets retain consumed sends", async () => {
  const db = await createTestDatabase();
  try {
    await db.query(`insert into clinic.otp_codes (phone, code_hash, expires_at, consumed_at, created_at)
      select '+201111111111', $1, now(), now(), now() - (i * interval '2 minutes') from generate_series(1, 5) as i`, [goodHash]);
    await db.query(`insert into clinic.otp_codes (phone, code_hash, expires_at, consumed_at, created_at)
      select '+202222222222', $1, now(), now(), now() - (i * interval '1 hour') from generate_series(2, 13) as i`, [goodHash]);
    for (const phone of ["+201111111111", "+202222222222"]) {
      const result = await db.query<{ result: { success: boolean; reason: string } }>(
        "select clinic.issue_otp($1, $2) as result", [phone, goodHash]);
      assert.deepEqual({ success: result.rows[0].result.success, reason: result.rows[0].result.reason },
        { success: false, reason: "too_many_requests" });
    }
  } finally {
    await db.close();
  }
});

test("OTP RPCs are unavailable to public callers and remain SECURITY INVOKER", async () => {
  const db = await createTestDatabase();
  try {
    const privileges = await db.query<{ role: string; issue: boolean; verify: boolean }>(`
      select role, has_function_privilege(role, 'clinic.issue_otp(text,text)', 'execute') as issue,
      has_function_privilege(role, 'clinic.verify_otp(text,text)', 'execute') as verify
      from (values ('anon'), ('authenticated'), ('service_role')) as roles(role)`);
    assert.deepEqual(privileges.rows, [
      { role: "anon", issue: false, verify: false },
      { role: "authenticated", issue: false, verify: false },
      { role: "service_role", issue: true, verify: true },
    ]);
    const functions = await db.query<{ prosecdef: boolean }>(`
      select prosecdef from pg_proc where oid in ('clinic.issue_otp(text,text)'::regprocedure, 'clinic.verify_otp(text,text)'::regprocedure)`);
    assert.ok(functions.rows.every((row) => !row.prosecdef));
    await db.exec("set role service_role");
    const result = await db.query<{ result: { success: boolean } }>(
      "select clinic.issue_otp('+203333333333', $1) as result", [goodHash]);
    assert.equal(result.rows[0].result.success, true);
  } finally {
    await db.close();
  }
});
