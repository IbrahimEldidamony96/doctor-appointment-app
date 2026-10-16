import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/database";

const staffId = "user_1234567890abcdef";
const doctorId = "user_doctor0000000";

test("staff membership defaults to active, cannot grant doctor role and emits audit events", async () => {
  const db = await createTestDatabase();
  try {
    await db.query(`insert into clinic.staff_accounts
      (clerk_user_id,display_name,created_by_clerk_user_id,updated_by_clerk_user_id)
      values ($1,$2,$3,$3)`, [staffId, "موظف الاستقبال", doctorId]);
    const first = await db.query<{ role: string; is_active: boolean }>(
      "select role,is_active from clinic.staff_accounts where clerk_user_id=$1", [staffId]);
    assert.deepEqual(first.rows[0], { role: "secretary", is_active: true });

    await db.query(`update clinic.staff_accounts set is_active=false, updated_by_clerk_user_id=$1
      where clerk_user_id=$2`, [doctorId, staffId]);
    const audit = await db.query<{ action: string; actor_clerk_user_id: string }>(
      "select action,actor_clerk_user_id from clinic.staff_audit_log order by id");
    assert.deepEqual(audit.rows.map(row => row.action), ["staff_added", "staff_disabled"]);
    assert.ok(audit.rows.every(row => row.actor_clerk_user_id === doctorId));

    await assert.rejects(db.query(`update clinic.staff_accounts set role='doctor' where clerk_user_id=$1`, [staffId]));
    await assert.rejects(db.query(`insert into clinic.staff_accounts
      (clerk_user_id,display_name,created_by_clerk_user_id,updated_by_clerk_user_id)
      values ($1,$2,$3,$3)`, [staffId, "مكرر", doctorId]));
  } finally {
    await db.close();
  }
});

test("anon role cannot read staff identities or audit events", async () => {
  const db = await createTestDatabase();
  try {
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from clinic.staff_accounts"));
    await assert.rejects(db.query("select * from clinic.staff_audit_log"));
  } finally {
    await db.exec("reset role");
    await db.close();
  }
});
