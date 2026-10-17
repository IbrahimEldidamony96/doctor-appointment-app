import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/database";

const staffId = "user_staff123456789";
async function setup() {
  const db = await createTestDatabase();
  await db.exec("insert into clinic.settings(clinic_name) values ('Clinic')");
  const { rows: dates } = await db.query<{ day: string; other_day: string }>(\`
    select ((now() at time zone 'Africa/Cairo')::date + 2)::text as day,
      ((now() at time zone 'Africa/Cairo')::date + 3)::text as other_day\`);
  const { day, other_day } = dates[0];
  for (const date of [day, other_day]) {
    await db.query(\`insert into clinic.availability
      (day_of_week,start_time,end_time,slot_duration_minutes)
      values (extract(dow from $1::date),'09:00','12:00',30)\`, [date]);
  }
  const { rows } = await db.query<{ id: string }>(
    "insert into clinic.patients(phone,name,email) values('+201234567897','Patient','patient@example.com') returning id");
  const { rows: booked } = await db.query<{ id: string }>(
    "select clinic.create_patient_appointment($1,$2::date,'09:00'::time,'09:30'::time) as id",
    [rows[0].id, day]);
  return { db, appointmentId: booked[0].id, patientId: rows[0].id, day, other_day };
}

test("booking event is atomic, attributed, and has one durable outbox entry", async () => {
  const { db, appointmentId, patientId } = await setup();
  try {
    const audit = await db.query<{ actor: string; event_type: string }>(
      "select actor,event_type from clinic.appointment_audit_events where appointment_id=$1",
      [appointmentId]);
    assert.deepEqual(audit.rows, [{
      actor: "patient:" + patientId, event_type: "created",
    }]);
    const queue = await db.query<{ event_type: string; state: string }>(
      "select event_type,state from clinic.notification_outbox where appointment_id=$1",
      [appointmentId]);
    assert.deepEqual(queue.rows, [{ event_type: "booked", state: "pending" }]);
    await assert.rejects(db.query(
      "select clinic.create_patient_appointment($1,$2::date,'09:00'::time,'09:30'::time)",
      [patientId, "2026-01-01"],
    ));
    const events = await db.query<{ count: number }>(
      "select count(*)::int as count from clinic.appointment_audit_events");
    assert.equal(events.rows[0].count, 1);
  } finally { await db.close(); }
});

test("staff status change suppresses stale booking email and atomically queues confirmation", async () => {
  const { db, appointmentId } = await setup();
  try {
    const updated = await db.query<{ result: string }>(
      "select clinic.update_staff_appointment_status($1,$2,$3) as result",
      [appointmentId,staffId,"confirmed"]);
    assert.equal(updated.rows[0].result, "updated");
    const again = await db.query<{ result: string }>(
      "select clinic.update_staff_appointment_status($1,$2,$3) as result",
      [appointmentId,staffId,"confirmed"]);
    assert.equal(again.rows[0].result, "invalid_transition");
    const events = await db.query<{ actor: string; event_type: string }>(
      "select actor,event_type from clinic.appointment_audit_events order by id");
    assert.deepEqual(events.rows, [
      { actor: events.rows[0].actor, event_type: "created" },
      { actor: "staff:" + staffId, event_type: "status_changed" },
    ]);
    const jobs = await db.query<{ event_type: string; state: string }>(
      "select event_type,state from clinic.notification_outbox order by created_at,id");
    assert.equal(jobs.rows.length, 2);
    assert.ok(jobs.rows.some(r => r.event_type === "booked" && r.state === "suppressed"));
    assert.ok(jobs.rows.some(r => r.event_type === "confirmed" && r.state === "pending"));
  } finally { await db.close(); }
});

test("claims are lease-token guarded, with retry and deterministic completion", async () => {
  const { db } = await setup();
  try {
    const claim = async () => db.query<{ id: string; claim_token: string; attempts: number }>(
      "select id,claim_token,attempts from clinic.claim_notification_outbox(1)");
    const first = (await claim()).rows[0];
    assert.equal(first.attempts, 1);
    assert.equal((await claim()).rows.length, 0);
    const wrong = await db.query<{ acknowledged: boolean }>(
      "select clinic.finish_notification_outbox($1::uuid,gen_random_uuid(),'sent') as acknowledged",
      [first.id]);
    assert.equal(wrong.rows[0].acknowledged, false);
    const retry = await db.query<{ acknowledged: boolean }>(
      "select clinic.finish_notification_outbox($1::uuid,$2::uuid,'retry',null,'temporary') as acknowledged",
      [first.id,first.claim_token]);
    assert.equal(retry.rows[0].acknowledged, true);
    await db.query("update clinic.notification_outbox set next_attempt_at=now()-interval '1 minute' where id=$1", [first.id]);
    const second = (await claim()).rows[0];
    assert.equal(second.id, first.id);
    assert.equal(second.attempts, 2);
    assert.notEqual(second.claim_token, first.claim_token);
    const sent = await db.query<{ acknowledged: boolean }>(
      "select clinic.finish_notification_outbox($1::uuid,$2::uuid,'sent','provider-123') as acknowledged",
      [second.id,second.claim_token]);
    assert.equal(sent.rows[0].acknowledged, true);
    const row = await db.query<{ state: string; provider_message_id: string }>(
      "select state,provider_message_id from clinic.notification_outbox where id=$1", [first.id]);
    assert.deepEqual(row.rows[0], { state: "sent", provider_message_id: "provider-123" });
  } finally { await db.close(); }
});

test("reschedule is attributed, suppresses an undelivered confirmation and queues a new message", async () => {
  const { db, appointmentId, day, other_day } = await setup();
  try {
    await db.query("select clinic.update_staff_appointment_status($1,$2,'confirmed')", [appointmentId,staffId]);
    const { rows } = await db.query<{ result: { success: boolean } }>(
      "select clinic.reschedule_staff_appointment($1::uuid,$2,$3::date,'09:00'::time,'09:30'::time,$4::date,'10:00'::time,'10:30'::time) as result",
      [appointmentId,staffId,day,other_day]);
    assert.equal(rows[0].result.success, true);
    const last = await db.query<{ event_type: string; actor: string }>(
      "select event_type,actor from clinic.appointment_audit_events order by id desc limit 1");
    assert.deepEqual(last.rows[0], { event_type: "rescheduled", actor: "staff:" + staffId });
    const current = await db.query<{ event_type: string; state: string }>(
      "select event_type,state from clinic.notification_outbox where appointment_id=$1",
      [appointmentId]);
    assert.ok(current.rows.some(r => r.event_type === "rescheduled" && r.state === "pending"));
    assert.ok(current.rows.some(r => r.event_type === "confirmed" && r.state === "suppressed"));
  } finally { await db.close(); }
});

test("no anonymous client reads audit/outbox or calls queue RPCs", async () => {
  const { db } = await setup();
  try {
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from clinic.appointment_audit_events"));
    await assert.rejects(db.query("select * from clinic.notification_outbox"));
    await assert.rejects(db.query("select * from clinic.claim_notification_outbox(1)"));
    await db.exec("reset role");
    const privilege = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated','clinic.finish_notification_outbox(uuid,uuid,text,text,text)','execute') as allowed");
    assert.equal(privilege.rows[0].allowed, false);
  } finally { await db.close(); }
});
