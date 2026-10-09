import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./helpers/database";
import { getClinicInstant } from "../lib/clinic-time";

let db: PGlite;
let patientId: string;
let bookingDate: string;

before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate clinic.patients, clinic.settings, clinic.availability, clinic.blocked_dates cascade;");
  await db.exec("insert into clinic.settings (clinic_name) values ('Test clinic');");
  const patient = await db.query<{ id: string }>("insert into clinic.patients (phone, name) values ('+201000000001', 'Patient') returning id");
  patientId = patient.rows[0].id;
  const date = await db.query<{ date: string }>("select ((now() at time zone 'Africa/Cairo')::date + 2)::text as date");
  bookingDate = date.rows[0].date;
  await db.query("insert into clinic.availability (day_of_week, start_time, end_time) values (extract(dow from $1::date), '09:00', '12:00')", [bookingDate]);
  await db.exec("set role service_role;");
});

async function book(start = "09:00", end = "09:30", date = bookingDate, name: string | null = null) {
  const result = await db.query<{ id: string }>(
    "select clinic.create_patient_appointment($1, $2, $3, $4, null, $5, null) as id",
    [patientId, date, start, end, name]);
  return result.rows[0].id;
}

const databaseError = (code: string, message?: string) => (error: unknown) => {
  const failure = error as { code?: string; message?: string };
  return failure.code === code && (!message || failure.message === message);
};

test("valid booking commits profile and appointment; invalid slot rolls both back", async () => {
  const id = await book("09:00", "09:30", bookingDate, " Updated Patient ");
  const result = await db.query<{ name: string; status: string }>(
    "select p.name, a.status from clinic.appointments a join clinic.patients p on p.id = a.patient_id where a.id = $1", [id]);
  assert.deepEqual(result.rows[0], { name: "Updated Patient", status: "pending" });
  await assert.rejects(book("10:10", "10:40", bookingDate, "Must rollback"), databaseError("23514", "INVALID_BOOKING_SLOT"));
  const patient = await db.query<{ name: string }>("select name from clinic.patients where id = $1", [patientId]);
  assert.equal(patient.rows[0].name, "Updated Patient");
});

test("booking rejects past dates, booking window boundary and inactive schedules", async () => {
  const dates = await db.query<{ past: string; boundary: string }>(
    "select ((now() at time zone 'Africa/Cairo')::date - 1)::text as past, ((now() at time zone 'Africa/Cairo')::date + 30)::text as boundary");
  await assert.rejects(book("09:00", "09:30", dates.rows[0].past), databaseError("23514", "INVALID_BOOKING_DATE"));
  await assert.rejects(book("09:00", "09:30", dates.rows[0].boundary), databaseError("23514", "INVALID_BOOKING_DATE"));
  await db.exec("update clinic.availability set is_active = false");
  await assert.rejects(book(), databaseError("23514", "INVALID_BOOKING_SLOT"));
});

test("overlapping bookings with different start times are excluded; adjacent slots remain valid", async () => {
  await book();
  // A template change must not allow overlaps with visits using the previous duration.
  await db.exec("update clinic.availability set slot_duration_minutes = 20");
  await assert.rejects(book("09:20", "09:40"), databaseError("23P01"));
  assert.ok(await book("09:40", "10:00"));
});

test("partial and full-day exceptions are enforced by the database", async () => {
  await db.query("insert into clinic.blocked_dates (date, is_full_day, start_time, end_time) values ($1, false, '09:20', '09:40')", [bookingDate]);
  await assert.rejects(book(), databaseError("23514", "BOOKING_SLOT_BLOCKED"));
  assert.ok(await book("10:00", "10:30"));
  await db.query("insert into clinic.blocked_dates (date) values ($1)", [bookingDate]);
  await assert.rejects(book("11:00", "11:30"), databaseError("23514", "BOOKING_SLOT_BLOCKED"));
});

test("cancellation checks ownership and notice; terminal appointments cannot reopen", async () => {
  const id = await book();
  const callCancel = async (owner = patientId) => {
    const result = await db.query<{ result: string }>("select clinic.cancel_patient_appointment($1, $2) as result", [id, owner]);
    return result.rows[0].result;
  };
  assert.equal(await callCancel("00000000-0000-4000-8000-000000000001"), "not_your_appointment");
  await db.exec("update clinic.settings set cancellation_notice_hours = 168");
  assert.equal(await callCancel(), "too_late_to_cancel");
  await db.exec("update clinic.settings set cancellation_notice_hours = 0");
  assert.equal(await callCancel(), "cancelled");
  assert.equal(await callCancel(), "not_cancellable");
  await assert.rejects(db.query("update clinic.appointments set status = 'confirmed' where id = $1", [id]),
    databaseError("23514", "INVALID_APPOINTMENT_TRANSITION"));
  assert.ok(await book());
});

test("future visits cannot complete and reviews require the completed owner", async () => {
  const id = await book();
  await assert.rejects(db.query("insert into clinic.reviews (appointment_id, patient_id, rating) values ($1, $2, 5)", [id, patientId]), databaseError("23514"));
  await db.query("update clinic.appointments set status = 'confirmed' where id = $1", [id]);
  await assert.rejects(db.query("update clinic.appointments set status = 'completed' where id = $1", [id]),
    databaseError("23514", "APPOINTMENT_HAS_NOT_STARTED"));
  // Fixture for an already completed historical visit; application paths cannot bypass this trigger.
  await db.exec("reset role; alter table clinic.appointments disable trigger trg_appointments_validate;");
  await db.query("update clinic.appointments set status = 'completed', appointment_date = (now() at time zone 'Africa/Cairo')::date - 1 where id = $1", [id]);
  await db.exec("alter table clinic.appointments enable trigger trg_appointments_validate; set role service_role;");
  await assert.rejects(db.query("insert into clinic.reviews (appointment_id, patient_id, rating) values ($1, $2, 5)",
    [id, "00000000-0000-4000-8000-000000000001"]), databaseError("23514"));
  await db.query("insert into clinic.reviews (appointment_id, patient_id, rating) values ($1, $2, 5)", [id, patientId]);
  await assert.rejects(db.query("insert into clinic.reviews (appointment_id, patient_id, rating) values ($1, $2, 4)", [id, patientId]), databaseError("23505"));
});

test("invalid durations and overlapping active schedule templates are rejected", async () => {
  await assert.rejects(db.exec("update clinic.availability set slot_duration_minutes = 0"), databaseError("23514"));
  await assert.rejects(db.query("insert into clinic.availability (day_of_week, start_time, end_time) values (extract(dow from $1::date), '10:00', '13:00')", [bookingDate]), databaseError("23P01"));
  await assert.rejects(db.exec("update clinic.settings set booking_window_days = -1"), databaseError("23514"));
});

test("anonymous and Supabase-authenticated roles cannot access clinic data or RPCs", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role};`);
    await assert.rejects(db.exec("select * from clinic.patients"), databaseError("42501"));
    await assert.rejects(db.exec("select * from clinic.get_dashboard_stats()"), databaseError("42501"));
  }
  await db.exec("reset role");
  const privileges = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('anon', 'clinic.create_patient_appointment(uuid,date,time,time,text,text,text)', 'execute') as allowed");
  assert.equal(privileges.rows[0].allowed, false);
});

test("clinic catalog security checks keep RLS and safe function privileges on every object", async () => {
  await db.exec("reset role");
  const unsafeTables = await db.query<{ name: string }>(`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clinic' and c.relkind = 'r' and not c.relrowsecurity
  `);
  assert.deepEqual(unsafeTables.rows, []);
  const unsafeFunctions = await db.query<{ name: string }>(`
    select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clinic' and (
      p.prosecdef or p.proconfig is null or array_to_string(p.proconfig, ',') not like '%search_path=%'
      or has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
      or not has_function_privilege('service_role', p.oid, 'execute')
    )
  `);
  assert.deepEqual(unsafeFunctions.rows, []);
  const missingIndexes = await db.query<{ name: string }>(`
    select constraint_row.conname as name from pg_constraint constraint_row
    join pg_namespace namespace on namespace.oid = constraint_row.connamespace
    where namespace.nspname = 'clinic' and constraint_row.contype = 'f'
      and not exists (
        select 1 from pg_index i where i.indrelid = constraint_row.conrelid
          and i.indkey[0] = constraint_row.conkey[1]
      )
  `);
  assert.deepEqual(missingIndexes.rows, []);
});

test("PostgreSQL and the slot display agree on Cairo DST gap and repeated hour rules", async () => {
  const result = await db.query<{ gap: string; repeated: number }>(`
    select ((timestamp '2026-04-24 00:30' at time zone 'Africa/Cairo')
      at time zone 'Africa/Cairo')::text as gap,
      (extract(epoch from timestamp '2026-10-29 23:30' at time zone 'Africa/Cairo') * 1000)::double precision as repeated
  `);
  assert.equal(result.rows[0].gap, "2026-04-24 01:30:00");
  assert.equal(getClinicInstant("2026-04-24", "00:30"), null);
  assert.equal(getClinicInstant("2026-10-29", "23:30")?.getTime(), result.rows[0].repeated);
});
