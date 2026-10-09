import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./helpers/database";

let db: PGlite;
let patientId: string;
let appointmentId: string;
type Attempt = { success: boolean; existing?: boolean; reason?: string; payment?: { id: string; amount: number } };
type Callback = { success: boolean; confirmed?: boolean; duplicate?: boolean; reason?: string };
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; truncate clinic.patients, clinic.settings, clinic.availability, clinic.blocked_dates cascade;");
  await db.exec("insert into clinic.settings(clinic_name,consultation_price) values('Test clinic',250)");
  patientId = (await db.query<{ id: string }>("insert into clinic.patients(phone,name) values('+201000000001','Patient') returning id")).rows[0].id;
  const date = (await db.query<{ date: string }>("select ((now() at time zone 'Africa/Cairo')::date + 2)::text as date")).rows[0].date;
  await db.query("insert into clinic.availability(day_of_week,start_time,end_time) values(extract(dow from $1::date),'09:00','12:00')", [date]);
  await db.exec("set role service_role");
  appointmentId = (await db.query<{ id: string }>("select clinic.create_patient_appointment($1,$2,'09:00','09:30',null,null,null) as id", [patientId,date])).rows[0].id;
});
async function begin(owner = patientId) {
  return (await db.query<{ result: Attempt }>("select clinic.begin_payment_attempt($1,$2) as result", [appointmentId,owner])).rows[0].result;
}
async function ready() {
  const result = await begin();
  assert.ok(result.payment);
  await db.query("update clinic.payments set provider_order_id='1234',intention_id='pi_test' where id=$1", [result.payment.id]);
  return result.payment.id;
}
async function callback(amount = 25000, success = true, order = "1234") {
  return (await db.query<{ result: Callback }>("select clinic.apply_paymob_transaction($1,'9876',$2,$3) as result", [order,amount,success])).rows[0].result;
}

test("parallel payment requests reserve one attempt and enforce ownership", async () => {
  const attempts = await Promise.all([begin(),begin()]);
  assert.equal(attempts[0].payment?.id,attempts[1].payment?.id);
  assert.equal(attempts.filter(a => a.existing).length,1);
  assert.equal((await begin("00000000-0000-4000-8000-000000000001")).reason,"not_your_appointment");
});

test("callback checks signed order and amount before changing payment or appointment", async () => {
  await ready();
  assert.equal((await callback(25000,true,"unsigned-merchant-reference")).reason,"unknown_order");
  assert.equal((await callback(1)).reason,"amount_mismatch");
  assert.deepEqual((await db.query<{ payment: string; appointment: string }>(
    "select p.status as payment,a.status as appointment from clinic.payments p join clinic.appointments a on a.id=p.appointment_id")).rows[0],
    { payment: "pending", appointment: "pending" });
  assert.equal((await callback()).confirmed,true);
  assert.deepEqual((await db.query<{ payment: string; appointment: string }>(
    "select p.status as payment,a.status as appointment from clinic.payments p join clinic.appointments a on a.id=p.appointment_id")).rows[0],
    { payment: "paid", appointment: "confirmed" });
});

test("duplicate success and delayed failure preserve paid state and block a new checkout", async () => {
  await ready(); await callback();
  assert.equal((await callback()).duplicate,true);
  assert.equal((await callback(25000,false)).duplicate,true);
  assert.equal((await begin()).reason,"already_paid");
  assert.equal((await db.query<{ status: string }>("select status from clinic.payments")).rows[0].status,"paid");
});

test("late payment is recorded without reopening a cancelled appointment", async () => {
  await ready();
  await db.query("update clinic.appointments set status='cancelled' where id=$1", [appointmentId]);
  assert.equal((await callback()).confirmed,false);
  assert.equal((await db.query<{ status: string }>("select status from clinic.appointments")).rows[0].status,"cancelled");
  assert.equal((await begin()).reason,"not_payable");
});

test("missing price and expired checkout are handled before a new attempt", async () => {
  await db.exec("update clinic.settings set consultation_price=null");
  assert.equal((await begin()).reason,"no_price_configured");
  await db.exec("update clinic.settings set consultation_price=250");
  const original = await ready();
  await db.exec("update clinic.payments set created_at=now()-interval '66 minutes'");
  const next = await begin();
  assert.equal(next.existing,false);
  assert.notEqual(next.payment?.id,original);
  // A late signed success can still reconcile the original charge.
  assert.equal((await callback()).success,true);
});

test("reminder leases use Cairo appointment instants and avoid concurrent claims", async () => {
  await db.exec("reset role; alter table clinic.appointments disable trigger trg_appointments_validate;");
  await db.query(`update clinic.appointments set status='confirmed',
    appointment_date=((now()+interval '3 hours') at time zone 'Africa/Cairo')::date,
    start_time=date_trunc('hour',(now()+interval '3 hours') at time zone 'Africa/Cairo')::time,
    end_time=(date_trunc('hour',(now()+interval '3 hours') at time zone 'Africa/Cairo')+interval '30 minutes')::time
    where id=$1`, [appointmentId]);
  await db.exec("alter table clinic.appointments enable trigger trg_appointments_validate; set role service_role");
  const first = await db.query<{ id: string; claim_token: string }>("select * from clinic.claim_appointment_reminders()");
  assert.equal(first.rows.length,1);
  assert.ok(first.rows[0].claim_token);
  assert.equal((await db.query("select * from clinic.claim_appointment_reminders()")).rows.length,0);
  await db.exec("update clinic.appointments set reminder_claimed_at=now()-interval '16 minutes'");
  assert.equal((await db.query("select * from clinic.claim_appointment_reminders()")).rows.length,1);
  await db.exec("update clinic.appointments set reminder_sent_at=now()");
  assert.equal((await db.query("select * from clinic.claim_appointment_reminders()")).rows.length,0);
});

test("payment and reminder RPCs are inaccessible to public database roles", async () => {
  await db.exec("reset role");
  for (const role of ["anon","authenticated"]) {
    const result = await db.query<{ allowed: boolean }>(`select
      has_function_privilege($1,'clinic.begin_payment_attempt(uuid,uuid)','execute') or
      has_function_privilege($1,'clinic.apply_paymob_transaction(text,text,bigint,boolean)','execute') or
      has_function_privilege($1,'clinic.claim_appointment_reminders()','execute') as allowed`, [role]);
    assert.equal(result.rows[0].allowed,false);
  }
});
