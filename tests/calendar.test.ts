import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarDateInRange,
  calendarHref,
  groupCalendarAppointments,
  parseCalendarQuery,
  saturdayOf,
  shiftCalendar,
  visibleCalendarDays,
  type CalendarAppointment,
} from "../lib/clinic-calendar";

const TODAY = "2026-10-17"; // Saturday, Cairo local calendar day.

test("the clinic's week starts on Saturday and crosses month/year boundaries safely", () => {
  assert.equal(saturdayOf("2026-10-17"), "2026-10-17");
  assert.equal(saturdayOf("2026-10-23"), "2026-10-17");
  assert.deepEqual(visibleCalendarDays("2026-10-19", "week"), [
    "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20",
    "2026-10-21", "2026-10-22", "2026-10-23",
  ]);
  assert.equal(saturdayOf("2027-01-01"), "2026-12-26");
  assert.deepEqual(visibleCalendarDays("2026-04-24", "day"), ["2026-04-24"]);
  assert.equal(shiftCalendar("2026-12-30", "week", 1), "2027-01-06");
  assert.equal(shiftCalendar("2027-01-01", "day", -1), "2026-12-31");
});

test("query validation rejects arrays, broken dates, far future values and injected status", () => {
  assert.deepEqual(parseCalendarQuery({}, TODAY), {
    view: "week", date: TODAY, status: "all", appointment: null,
  });
  assert.deepEqual(parseCalendarQuery({
    view: ["day", "week"],
    date: "2026-02-31",
    status: "cancelled;drop table",
    appointment: "not-a-uuid",
  }, TODAY), {
    view: "week", date: TODAY, status: "all", appointment: null,
  });
  assert.equal(calendarDateInRange("2027-10-17", TODAY), true);
  assert.equal(calendarDateInRange("2027-10-18", TODAY), false);
  assert.equal(calendarDateInRange("2024-02-29", TODAY), false);
  assert.deepEqual(parseCalendarQuery({
    view: "day", date: "2026-10-18", status: "confirmed",
    appointment: "00000000-0000-4000-8000-000000000123",
  }, TODAY), {
    view: "day", date: "2026-10-18", status: "confirmed",
    appointment: "00000000-0000-4000-8000-000000000123",
  });
});

test("calendar links encode only the allowlisted state and selected booking", () => {
  const query = parseCalendarQuery({
    view: "day", date: "2026-10-17", status: "pending",
    appointment: "00000000-0000-4000-8000-000000000123",
  }, TODAY);
  const link = calendarHref(query, { view: "week", appointment: null });
  const url = new URL(link, "http://localhost");
  assert.equal(url.pathname, "/dashboard/calendar");
  assert.equal(url.searchParams.get("view"), "week");
  assert.equal(url.searchParams.get("date"), TODAY);
  assert.equal(url.searchParams.get("status"), "pending");
  assert.equal(url.searchParams.has("appointment"), false);
});

test("grouping sorts appointments per day without reordering the input list", () => {
  const make = (id: string, date: string, start: string): CalendarAppointment => ({
    id, appointment_date: date, start_time: start, end_time: "11:30:00",
    status: "confirmed", reason_for_visit: null, patient_name: "Test",
    patient_phone: "+201234567891",
  });
  const input = [
    make("b", TODAY, "11:00:00"),
    make("a", TODAY, "09:00:00"),
    make("c", "2026-10-18", "08:00:00"),
    make("out", "2026-10-20", "07:00:00"),
  ];
  const before = [...input];
  const grouped = groupCalendarAppointments([TODAY, "2026-10-18"], input);
  assert.deepEqual(grouped.get(TODAY)?.map(row => row.id), ["a", "b"]);
  assert.deepEqual(grouped.get("2026-10-18")?.map(row => row.id), ["c"]);
  assert.equal(grouped.has("2026-10-20"), false);
  assert.deepEqual(input, before);
});
