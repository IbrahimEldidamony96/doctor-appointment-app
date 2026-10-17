import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/database";

type Appointment = { id: string; appointment_date: string; start_time: string; end_time: string; status: string };
type Response = { success: boolean; reason?: string };

const staff = "user_staff123456789";
async function fixture() {
  const db = await createTestDatabase();
  await db.exec("insert into clinic.settings(clinic_name) values ('Test clinic')");
  const dates = await db.query<{ first: string; next: string }>(`
    select ((now() at time zone 'Africa/Cairo')::date + 2)::text as first,
      ((now() at time zone 'Africa/Cairo')::date + 3)::text as next`);
  const { first, next } = dates.rows[0];
  for (const day of [first, next]) {
    await db.query(`insert into clinic.availability(day_of_week,start_time,end_time,slot_duration_minutes)
      values (extract(dow from $1::date),'09:00','12:00',30)`, [day]);
  }
  const { rows } = await db.query<{ id: string }>(
    "insert into clinic.patients(phone,name) values('+201234567899','Test Patient') returning id");
  const appointment = await db.query<{ id: string }>(`
    select clinic.create_patient_appointment($1,$2::date,'09:00'::time,'09:30'::time) as id`,
    [rows[0].id, first]);
  const appointmentId = appointment.rows[0].id;

  const move = async (overrides: Partial<{
    appointmentId: string; expectedDate: string; expectedStart: string; expectedEnd: string;
    date: string; start: string; end: string;
  }> = {}): Promise<Response> => {
    const p = {
      appointmentId, expectedDate: first, expectedStart: "09:00", expectedEnd: "09:30",
      date: next, start: "10:00", end: "10:30", ...overrides,
    };
    const answer = await db.query<{ result: Response }>(`
      select clinic.reschedule_staff_appointment(
        $1::uuid,$2,$3::date,$4::time,$5::time,$6::date,$7::time,$8::time
      ) as result`,
      [p.appointmentId, staff, p.expectedDate, p.expectedStart, p.expectedEnd, p.date, p.start, p.end]);
    return answer.rows[0].result;
  };
  return { db, first, next, appointmentId, move };
}

test("reschedule moves the same appointment, preserves status and produces exact audit", async () => {
  const { db, appointmentId, next, first, move } = await fixture();
  try {
    // Without the special RPC scope, direct field edits remain prohibited.
    await assert.rejects(db.query("update clinic.appointments set appointment_date=$1 where id=$2",
      [next, appointmentId]), (error: unknown) => (error as { code?: string }).code === "23514");
    await db.query("update clinic.appointments set reminder_sent_at=now() where id=$1", [appointmentId]);

    assert.deepEqual(await move(), { success: true, appointment_id: appointmentId });
    const appointment = await db.query<Appointment>(`
      select id,appointment_date::text,start_time::text,end_time::text,status
        from clinic.appointments where id=$1`, [appointmentId]);
    assert.equal(appointment.rows[0].appointment_date, next);
    assert.equal(appointment.rows[0].start_time, "10:00:00");
    assert.equal(appointment.rows[0].status, "pending");
    const reminders = await db.query<{ sent: string | null }>(
      "select reminder_sent_at::text as sent from clinic.appointments where id=$1", [appointmentId]);
    assert.equal(reminders.rows[0].sent, null);
    const audit = await db.query<{ actor: string; old_day: string; new_day: string }>(`
      select actor_clerk_user_id as actor,old_date::text as old_day,new_date::text as new_day
      from clinic.appointment_reschedule_audit where appointment_id=$1`, [appointmentId]);
    assert.deepEqual(audit.rows, [{ actor: staff, old_day: first, new_day: next }]);
    assert.deepEqual(await move(), { success: false, reason: "stale" });
  } finally { await db.close(); }
});

test("same slot, overlap and blocked dates all reject without creating audit entries", async () => {
  const { db, first, next, appointmentId, move } = await fixture();
  try {
    assert.deepEqual(await move({ date: first, start: "09:00", end: "09:30" }),
      { success: false, reason: "same_slot" });
    await db.query(`insert into clinic.appointments(patient_id,appointment_date,start_time,end_time)
      select patient_id,$1,'10:00','10:30' from clinic.appointments where id=$2`, [next, appointmentId]);
    await assert.rejects(move(), (error: unknown) => (error as { code?: string }).code === "23P01");
    await db.query("insert into clinic.blocked_dates(date) values($1)", [next]);
    await assert.rejects(move({ start: "11:00", end: "11:30" }),
      (error: unknown) => (error as { code?: string }).code === "23514");
    const count = await db.query<{ count: string }>("select count(*)::text as count from clinic.appointment_reschedule_audit");
    assert.equal(count.rows[0].count, "0");
  } finally { await db.close(); }
});

test("payment initiation and terminal appointment prevent a staff move", async () => {
  const { db, appointmentId, move } = await fixture();
  try {
    await db.query("insert into clinic.payments(appointment_id,amount) values($1,100)", [appointmentId]);
    assert.deepEqual(await move(), { success: false, reason: "payment_in_progress" });
    await db.query("update clinic.payments set status='failed' where appointment_id=$1", [appointmentId]);
    await db.query("update clinic.appointments set status='cancelled' where id=$1", [appointmentId]);
    assert.deepEqual(await move(), { success: false, reason: "not_reschedulable" });
  } finally { await db.close(); }
});

test("only service_role executes reschedule API and reads the audit trail", async () => {
  const { db, appointmentId, move } = await fixture();
  try {
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from clinic.appointment_reschedule_audit"));
    await assert.rejects(move({ appointmentId }));
    await db.exec("reset role");
    const grants = await db.query<{ allowed: boolean }>(`
      select has_function_privilege(
        'authenticated',
        'clinic.reschedule_staff_appointment(uuid,text,date,time,time,date,time,time)',
        'execute') as allowed`);
    assert.equal(grants.rows[0].allowed, false);
  } finally { await db.close(); }
});
