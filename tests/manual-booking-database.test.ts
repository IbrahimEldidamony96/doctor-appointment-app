import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase, seedStaff } from "./helpers/database";

test("manual booking creates a patient and audit record, rejects overlaps and preserves existing profile", async () => {
  const db = await createTestDatabase();
  const doctor = "user_doctor123456789";
  const phone = "+201234567891";
  try {
    await seedStaff(db, doctor, 'doctor');
    const upcoming = await db.query<{ day: string; dow: number }>(`
      select ((now() at time zone 'Africa/Cairo')::date + 1)::text as day,
      extract(dow from ((now() at time zone 'Africa/Cairo')::date + 1))::int as dow`);
    const { day, dow } = upcoming.rows[0];
    await db.query("insert into clinic.availability(day_of_week,start_time,end_time,slot_duration_minutes) values ($1,'12:00','14:00',30)", [dow]);

    const args = [doctor, phone, "مريض يدوي", day, "12:00", "12:30", "الكشف الأول"];
    const result = await db.query<{ create_staff_appointment: string }>(
      "select clinic.create_staff_appointment($1,$2,$3,$4::date,$5::time,$6::time,$7)",
      args);
    assert.match(result.rows[0].create_staff_appointment, /^[a-f0-9-]{36}$/);
    const patient = await db.query<{ name: string }>("select name from clinic.patients where phone=$1", [phone]);
    assert.equal(patient.rows[0].name, "مريض يدوي");
    const audit = await db.query<{ actor_id: string }>(
      "select actor_id from clinic.manual_booking_audit");
    assert.equal(audit.rows[0].actor_id, doctor);
    await assert.rejects(db.query(
      "select clinic.create_staff_appointment($1,$2,$3,$4::date,$5::time,$6::time,$7)",
      [doctor, phone, "اسم مختلف", day, "12:00", "12:30", null],
    ));
    const unchanged = await db.query<{ name: string }>("select name from clinic.patients where phone=$1", [phone]);
    assert.equal(unchanged.rows[0].name, "مريض يدوي");
  } finally {
    await db.close();
  }
});

test("manual booking RPC is not executable by anon clients", async () => {
  const db = await createTestDatabase();
  try {
    await db.exec("set role anon");
    await assert.rejects(db.query("select clinic.create_staff_appointment('user_1234567890', '+201234567899', 'Test User', current_date, '12:00'::time, '12:30'::time, null)"));
  } finally {
    await db.exec("reset role");
    await db.close();
  }
});
