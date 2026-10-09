import assert from "node:assert/strict";
import { test } from "node:test";
import { addCalendarDays, getClinicDateTime, getClinicInstant, isClockTime, isISODate } from "../lib/clinic-time";
import { generateAvailableSlots } from "../lib/availability-slots";

test("Cairo calendar handles UTC day boundaries and summer/winter offsets", () => {
  assert.deepEqual(getClinicDateTime(new Date("2026-07-01T22:30:00Z")), { date: "2026-07-02", time: "01:30" });
  assert.deepEqual(getClinicDateTime(new Date("2026-01-01T22:30:00Z")), { date: "2026-01-02", time: "00:30" });
  assert.equal(addCalendarDays("2024-02-28", 1), "2024-02-29");
  assert.equal(isISODate("2026-02-30"), false);
  assert.equal(isISODate("0000-01-01"), false);
  assert.equal(isISODate("2024-02-29"), true);
  assert.equal(isClockTime("24:00"), false);
  assert.equal(isClockTime("09:60"), false);
});

test("Cairo DST gaps are rejected and repeated hours use the PostgreSQL occurrence", () => {
  assert.equal(getClinicInstant("2026-04-24", "00:30"), null);
  assert.equal(getClinicInstant("2026-10-29", "23:30")?.toISOString(), "2026-10-29T21:30:00.000Z");
  const slots = generateAvailableSlots({ fromDate: "2026-04-24", days: 1,
    now: { date: "2026-04-23", time: "22:00" },
    availability: [{ day_of_week: 5, start_time: "00:00:00", end_time: "02:00:00", slot_duration_minutes: 30 }],
    blockedDates: [], appointments: [] });
  assert.deepEqual(slots.map((slot) => slot.startTime), ["01:00", "01:30"]);
  const repeated = generateAvailableSlots({ fromDate: "2026-10-29", days: 1,
    now: { date: "2026-10-29", time: "23:45" }, nowInstant: new Date("2026-10-29T20:45:00Z"),
    availability: [{ day_of_week: 4, start_time: "23:00:00", end_time: "23:59:00", slot_duration_minutes: 30 }],
    blockedDates: [], appointments: [] });
  assert.deepEqual(repeated.map((slot) => slot.startTime), ["23:00"]);
});

test("slots use interval overlap, partial blocks, sorted output and duplicate removal", () => {
  const availability = { day_of_week: 1, start_time: "09:00:00", end_time: "11:00:00", slot_duration_minutes: 30 };
  const slots = generateAvailableSlots({
    fromDate: "2026-10-05", days: 1,
    now: { date: "2026-10-04", time: "22:00" },
    availability: [availability, availability],
    blockedDates: [{ date: "2026-10-05", is_full_day: false, start_time: "10:40:00", end_time: "10:45:00" }],
    appointments: [{ appointment_date: "2026-10-05", start_time: "09:15:00", end_time: "09:45:00" }],
  });
  assert.deepEqual(slots, [{ date: "2026-10-05", startTime: "10:00", endTime: "10:30" }]);
});

test("full-day blocks and past dates hide slots; malformed and midnight schedules cannot loop", () => {
  const availability = [
    { day_of_week: 1, start_time: "23:30:00", end_time: "23:59:00", slot_duration_minutes: 30 },
    { day_of_week: 1, start_time: "09:00:00", end_time: "11:00:00", slot_duration_minutes: 0 },
  ];
  assert.deepEqual(generateAvailableSlots({ fromDate: "2026-10-05", days: 1,
    now: { date: "2026-10-05", time: "08:00" }, availability, blockedDates: [], appointments: [] }), []);
  assert.deepEqual(generateAvailableSlots({ fromDate: "2026-10-05", days: 1,
    now: { date: "2026-10-06", time: "08:00" }, availability: [], blockedDates: [], appointments: [] }), []);
  assert.deepEqual(generateAvailableSlots({ fromDate: "2026-10-05", days: 1,
    now: { date: "2026-10-04", time: "08:00" },
    availability: [{ ...availability[1], slot_duration_minutes: 30 }],
    blockedDates: [{ date: "2026-10-05", is_full_day: true, start_time: null, end_time: null }], appointments: [] }), []);
});
