import assert from "node:assert/strict";
import { test } from "node:test";
import { canChangeAppointmentStatus, hasPermission } from "../lib/auth/permissions";

test("only doctors may manage staff, settings, schedules, reviews and revenue", () => {
  for (const resource of ["staff:manage", "settings:manage", "schedule:manage", "stats:view", "reviews:manage"] as const) {
    assert.equal(hasPermission("secretary", resource), false, resource);
    assert.equal(hasPermission("doctor", resource), true, resource);
    assert.equal(hasPermission(null, resource), false, resource);
  }
});

test("secretaries can only view bookings and confirm or cancel", () => {
  for (const resource of ["dashboard:view", "appointments:view", "appointments:create_manual", "appointments:confirm", "appointments:cancel"] as const) {
    assert.equal(hasPermission("secretary", resource), true, resource);
    assert.equal(hasPermission(null, resource), false, resource);
  }
  for (const status of ["confirmed", "cancelled"] as const) {
    assert.equal(canChangeAppointmentStatus("secretary", status), true);
  }
  for (const status of ["completed", "no_show"] as const) {
    assert.equal(canChangeAppointmentStatus("secretary", status), false);
    assert.equal(canChangeAppointmentStatus("doctor", status), true);
  }
});
