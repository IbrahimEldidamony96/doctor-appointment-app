import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/database";

const doctor = "user_doctor123456789";
const denied = (code: string) => (error: unknown) =>
  (error as { code?: string }).code === code;

test("profile edits use optimistic locking and audit the actor atomically", async () => {
  const db = await createTestDatabase();
  try {
    const { rows } = await db.query<{ id: string; updated_at: string }>(
      "insert into clinic.patients(phone,name) values('+201234567891','Original') returning id,updated_at"
    );
    const { id, updated_at } = rows[0];
    const update = (expected: string, name: string) =>
      db.query<{ result: { success: boolean; reason?: string; updated_at?: string } }>(
        "select clinic.update_staff_patient_profile($1,$2::uuid,$3::timestamptz,$4,$5) as result",
        [doctor,id,expected,name,"test@example.com"],
      );
    const first = (await update(updated_at, "Corrected")).rows[0].result;
    assert.equal(first.success, true);
    assert.ok(first.updated_at);
    const second = (await update(updated_at, "Stale overwrite")).rows[0].result;
    assert.deepEqual(second, { success: false, reason: "stale" });
    const saved = await db.query<{ name: string; email: string }>(
      "select name,email from clinic.patients where id=$1", [id]);
    assert.deepEqual(saved.rows[0], { name: "Corrected", email: "test@example.com" });
    const audit = await db.query<{ action: string; actor_clerk_user_id: string }>(
      "select action,actor_clerk_user_id from clinic.patient_management_audit");
    assert.deepEqual(audit.rows, [{ action: "profile_updated", actor_clerk_user_id: doctor }]);

    const invalid = (await update(first.updated_at!, "x")).rows[0].result;
    assert.deepEqual(invalid, { success: false, reason: "invalid_input" });
  } finally {
    await db.close();
  }
});

test("only service role can call profile RPC or insert audit records", async () => {
  const db = await createTestDatabase();
  try {
    const { rows } = await db.query<{ id: string; updated_at: string }>(
      "insert into clinic.patients(phone,name) values('+201234567892','Protected') returning id,updated_at"
    );
    const { id, updated_at } = rows[0];
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select clinic.update_staff_patient_profile($1,$2::uuid,$3::timestamptz,$4,$5)",
        [doctor,id,updated_at,"Intruder","intruder@example.com"]),
      denied("42501"),
    );
    await assert.rejects(db.query("select * from clinic.patient_management_audit"), denied("42501"));
    await assert.rejects(db.query(
      "insert into clinic.patient_management_audit(patient_id,actor_clerk_user_id,action) values($1,$2,'history_exported')",
      [id,doctor]), denied("42501"));
    await db.exec("reset role");
    const privilege = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated','clinic.update_staff_patient_profile(text,uuid,timestamptz,text,text)','execute') as allowed"
    );
    assert.equal(privilege.rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
