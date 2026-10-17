import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentEventMatches, isOutboxEvent, outboxEmail, readOutboxPayload,
} from "../lib/outbox-message";

const payload = {
  name: '<img onerror="alert(1)">',
  date: "2026-10-19", time: "09:30", status: "confirmed",
  previous_date: "2026-10-18", previous_time: "11:00",
};
const appointment = {
  status: "confirmed", appointment_date: "2026-10-19",
  start_time: "09:30:00", deleted_at: null,
};

test("provider email is escaped; HTML text is not attacker-controlled", () => {
  const result = outboxEmail("rescheduled", payload);
  assert.ok(result.html.includes("&lt;img"));
  assert.ok(!result.html.includes("<img"));
  assert.ok(result.html.includes("2026-10-18"));
  assert.ok(result.html.includes("2026-10-19"));
  assert.equal(isOutboxEvent("arbitrary_template"), false);
});

test("only complete typed payloads are accepted", () => {
  assert.deepEqual(readOutboxPayload(payload), payload);
  assert.equal(readOutboxPayload({ date: "2026-10-19" }), null);
  assert.equal(readOutboxPayload({ ...payload, name: null }), null);
  assert.equal(readOutboxPayload({ ...payload, previous_time: undefined }), null);
  assert.equal(readOutboxPayload(null), null);
});

test("a superseded or cancelled booking notification is rejected before sending", () => {
  assert.equal(currentEventMatches("confirmed", payload, appointment), true);
  assert.equal(currentEventMatches("booked", payload, appointment), false);
  assert.equal(currentEventMatches("rescheduled", payload, appointment), true);
  assert.equal(currentEventMatches("rescheduled", payload,
    { ...appointment, start_time: "10:00:00" }), false);
  assert.equal(currentEventMatches("confirmed", payload,
    { ...appointment, status: "cancelled" }), false);
  assert.equal(currentEventMatches("confirmed", payload,
    { ...appointment, deleted_at: "2026-10-18T11:00:00Z" }), false);
});
