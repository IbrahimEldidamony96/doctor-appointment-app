import assert from "node:assert/strict";
import { test } from "node:test";
import {
  csvCell, parsePatientPage, parsePatientSearch, visitsToCsv,
} from "../lib/patient-management";

test("patient search refuses broad directory exposure and filter injection", () => {
  assert.deepEqual(parsePatientSearch(""), { kind: "invalid" });
  assert.deepEqual(parsePatientSearch("a"), { kind: "invalid" });
  assert.deepEqual(parsePatientSearch("%"), { kind: "invalid" });
  assert.deepEqual(parsePatientSearch("test_name"), { kind: "invalid" });
  assert.deepEqual(parsePatientSearch("a,b"), { kind: "invalid" });
  assert.deepEqual(parsePatientSearch("Ahmed*"), { kind: "invalid" });
  assert.deepEqual(parsePatientSearch("a\\b"), { kind: "invalid" });
  assert.deepEqual(parsePatientSearch("10"), { kind: "invalid" });
  assert.deepEqual(parsePatientSearch("  Ahmed Ali  "), { kind: "name", term: "Ahmed Ali" });
  assert.deepEqual(parsePatientSearch("أَحمَد"), { kind: "name", term: "أَحمَد" });
  assert.deepEqual(parsePatientSearch("+201000"), { kind: "phone", term: "+201000" });
  assert.deepEqual(parsePatientSearch("201000"), { kind: "phone", term: "+201000" });
  assert.deepEqual(parsePatientSearch("a".repeat(61)), { kind: "invalid" });
});

test("untrusted patient pagination is bounded and deterministic", () => {
  assert.equal(parsePatientPage(undefined), 1);
  assert.equal(parsePatientPage("-1"), 1);
  assert.equal(parsePatientPage("1.5"), 1);
  assert.equal(parsePatientPage("Infinity"), 1);
  assert.equal(parsePatientPage("1001"), 1);
  assert.equal(parsePatientPage(" 4 "), 4);
  assert.equal(parsePatientPage(2), 2);
  assert.equal(parsePatientPage("NaN"), 1);
});

test("CSV escapes quotes, newlines and formula-leading values", () => {
  assert.equal(csvCell('hello "world"'), '"hello ""world"""');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell(" \t@SUM(A1)"), '"\' \t@SUM(A1)"');
  assert.equal(csvCell("+201234567890"), '"\'+201234567890"');
  assert.equal(csvCell(null), '""');
  const report = visitsToCsv(
    { name: '=HYPERLINK("evil")', phone: "+201000000000", email: null },
    [{
      id: "test", appointment_date: "2026-10-19", start_time: "09:00",
      end_time: "09:30", status: "confirmed", reason_for_visit: '@cmd,\r\n"payload"',
    }],
  );
  assert.ok(report.startsWith("\uFEFF"));
  assert.ok(report.includes('"\'+201000000000"'));
  assert.ok(report.includes('"\'=HYPERLINK(""evil"")"'));
  assert.ok(report.includes('"\'@cmd,\r\n""payload"""'));
  assert.equal(report.split("Patient name").length, 2);
});
