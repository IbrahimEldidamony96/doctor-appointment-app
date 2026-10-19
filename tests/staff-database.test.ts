import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase, seedStaff } from "./helpers/database";

const staffId = "legacy_staff_1234567890";
const doctorId = "7cc22909-1f40-4acc-8f1d-c989ca9703cf";
const denied = (code: string) => (error: unknown) => (error as { code?: string }).code === code;

test("approved staff use unique WhatsApp numbers, opaque IDs and audited role changes", async () => {
  const db = await createTestDatabase();
  try {
    await seedStaff(db, doctorId);
    await db.query(`insert into clinic.staff_accounts
      (id,phone,display_name,created_by,updated_by)
      values ($1,'+201000000002','Reception',$2,$2)`, [staffId, doctorId]);
    const first = await db.query<{ role: string; is_active: boolean }>(
      "select role,is_active from clinic.staff_accounts where id=$1", [staffId]);
    assert.deepEqual(first.rows[0], { role: "secretary", is_active: true });

    await db.query(`update clinic.staff_accounts set role='nurse', updated_by=$1 where id=$2`, [doctorId, staffId]);
    await db.query(`update clinic.staff_accounts set is_active=false, updated_by=$1 where id=$2`, [doctorId, staffId]);
    const audit = await db.query<{ action: string; actor_id: string }>(
      "select action,actor_id from clinic.staff_audit_log where target_id=$1 order by id", [staffId]);
    assert.deepEqual(audit.rows.map(row => row.action), ["staff_added", "staff_updated", "staff_disabled"]);
    assert.ok(audit.rows.every(row => row.actor_id === doctorId));

    const doctor = await db.query<{ id: string }>(`insert into clinic.staff_accounts
      (phone,display_name,role,created_by,updated_by)
      values ('+201000000003','Second Doctor','doctor',$1,$1) returning id`, [doctorId]);
    assert.match(doctor.rows[0].id, /^[0-9a-f-]{36}$/);
    await assert.rejects(db.query(`update clinic.staff_accounts set role='admin' where id=$1`, [staffId]), denied("23514"));
    await assert.rejects(seedStaff(db, "duplicate-phone", "doctor"), denied("23505"));
    await assert.rejects(seedStaff(db, "invalid-phone", "doctor", "01012345678"), denied("23514"));
    await assert.rejects(db.query(`insert into clinic.staff_accounts
      (display_name,is_active,created_by,updated_by) values ('No Phone',false,$1,$1)`, [doctorId]), denied("23514"));
    await assert.rejects(db.query("update clinic.staff_accounts set id='new-id' where id=$1", [staffId]), denied("23514"));
  } finally { await db.close(); }
});

test("migration keeps legacy identities and audits while revoking unlinked access", async () => {
  const legacyId = "user_archived123456789";
  const db = await createTestDatabase(async (connection, migration) => {
    if (!migration.endsWith("_whatsapp_staff_auth.sql")) return;
    await connection.query(`insert into clinic.staff_accounts
      (clerk_user_id,display_name,created_by_clerk_user_id,updated_by_clerk_user_id)
      values ($1,'Legacy Staff',$1,$1)`, [legacyId]);
  });
  try {
    const legacy = await db.query<{ id: string; phone: null; is_active: boolean }>(
      "select id,phone,is_active from clinic.staff_accounts");
    assert.deepEqual(legacy.rows, [{ id: legacyId, phone: null, is_active: false }]);
    const audit = await db.query<{ actor_id: string; target_id: string; action: string }>(
      "select actor_id,target_id,action from clinic.staff_audit_log order by id");
    assert.deepEqual(audit.rows, [
      { actor_id: legacyId, target_id: legacyId, action: "staff_added" },
      { actor_id: legacyId, target_id: legacyId, action: "staff_disabled" },
    ]);
    await assert.rejects(db.query("update clinic.staff_accounts set is_active=true where id=$1", [legacyId]), denied("23514"));
    await db.query("update clinic.staff_accounts set phone='+201000000005',is_active=true where id=$1", [legacyId]);
    const active = await db.query<{ id: string }>("select id from clinic.staff_accounts where is_active");
    assert.equal(active.rows[0].id, legacyId);
  } finally { await db.close(); }
});

test("owner bootstrap is service-only, one-time, input-validated and cannot lose ownership", async () => {
  const db = await createTestDatabase();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select clinic.bootstrap_clinic_owner('+201000000010','Doctor Owner')"), denied("42501"));
      await assert.rejects(db.query("select * from clinic.staff_accounts"), denied("42501"));
      await assert.rejects(db.query("select * from clinic.staff_audit_log"), denied("42501"));
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await assert.rejects(db.query("select clinic.bootstrap_clinic_owner('01000000000','Doctor Owner')"), /INVALID_OWNER_INPUT/);
    await assert.rejects(db.query("select clinic.bootstrap_clinic_owner('+201000000010','x')"), /INVALID_OWNER_INPUT/);
    // PGlite serializes queries. PostgreSQL also serializes separate bootstrap
    // connections through the function's transaction advisory lock.
    const results = await Promise.allSettled([
      db.query<{ id: string }>("select clinic.bootstrap_clinic_owner('+201000000010','Doctor Owner') as id"),
      db.query<{ id: string }>("select clinic.bootstrap_clinic_owner('+201000000011','Another Owner') as id"),
    ]);
    const success = results.find(result => result.status === "fulfilled");
    const failure = results.find(result => result.status === "rejected");
    assert.ok(success && success.status === "fulfilled");
    assert.ok(failure && failure.status === "rejected");
    assert.match(String(failure.reason), /CLINIC_OWNER_ALREADY_EXISTS/);
    const id = success.value.rows[0].id;
    const owner = await db.query<{ role: string; is_owner: boolean; is_active: boolean }>(
      "select role,is_owner,is_active from clinic.staff_accounts where id=$1", [id]);
    assert.deepEqual(owner.rows[0], { role: "doctor", is_owner: true, is_active: true });
    for (const assignment of ["is_active=false", "role='nurse'", "is_owner=false"]) {
      await assert.rejects(db.query(`update clinic.staff_accounts set ${assignment} where id=$1`, [id]), /CLINIC_OWNER_PROTECTED/);
    }
    await assert.rejects(db.query("delete from clinic.staff_accounts where id=$1", [id]), /CLINIC_OWNER_PROTECTED/);
    await assert.rejects(db.query(`insert into clinic.staff_accounts
      (phone,display_name,role,is_owner,created_by,updated_by)
      values ('+201000000012','Second Owner','doctor',true,$1,$1)`, [id]), denied("23505"));
    const config = await db.query<{ invoker: boolean }>(`select not prosecdef as invoker
      from pg_proc where oid='clinic.bootstrap_clinic_owner(text,text)'::regprocedure`);
    assert.equal(config.rows[0].invoker, true);
  } finally {
    await db.exec("reset role");
    await db.close();
  }
});

test("staff RPCs require active linked members and reserve medical outcomes for doctors", async () => {
  const db = await createTestDatabase();
  const appointmentId = "348b5668-b2a9-4cb5-9569-fc84e80f1420";
  try {
    await seedStaff(db, "opaque-doctor-id", "doctor");
    await seedStaff(db, "opaque-nurse-id", "nurse", "+201000000002");
    const status = async (actor: string, next = "confirmed") => (await db.query<{ result: string }>(
      "select clinic.update_staff_appointment_status($1,$2,$3) as result", [appointmentId, actor, next])).rows[0].result;
    assert.equal(await status("unknown-id"), "invalid_input");
    assert.equal(await status("opaque-nurse-id"), "invalid_transition");
    assert.equal(await status("opaque-nurse-id", "completed"), "invalid_input");
    assert.equal(await status("opaque-nurse-id", "no_show"), "invalid_input");
    assert.equal(await status("opaque-doctor-id", "completed"), "invalid_transition");
    const profile = async (actor: string) => (await db.query<{ result: { success: boolean; reason: string } }>(
      "select clinic.update_staff_patient_profile($1,$2,now(),'Edited','test@example.com') as result",
      [actor, appointmentId])).rows[0].result;
    assert.deepEqual(await profile("opaque-nurse-id"), { success: false, reason: "invalid_input" });
    assert.deepEqual(await profile("opaque-doctor-id"), { success: false, reason: "not_found" });
    await db.query("update clinic.staff_accounts set is_active=false where id='opaque-doctor-id'");
    assert.equal(await status("opaque-doctor-id"), "invalid_input");
    assert.deepEqual(await profile("opaque-doctor-id"), { success: false, reason: "invalid_input" });
    await assert.rejects(db.query(`select clinic.create_staff_appointment(
      'opaque-doctor-id','+201000000009','Patient',current_date,'09:00','09:30',null)`), /INVALID_MANUAL_BOOKING_INPUT/);
    const moved = await db.query<{ result: { success: boolean; reason: string } }>(`select clinic.reschedule_staff_appointment(
      $1,'opaque-doctor-id',current_date,'09:00','09:30',current_date+1,'10:00','10:30') as result`, [appointmentId]);
    assert.deepEqual(moved.rows[0].result, { success: false, reason: "invalid_input" });
    const names = await db.query<{ argument: string }>(`select proargnames[2] as argument from pg_proc
      where oid='clinic.update_staff_appointment_status(uuid,text,text)'::regprocedure`);
    assert.equal(names.rows[0].argument, "p_actor_id");
  } finally { await db.close(); }
});
