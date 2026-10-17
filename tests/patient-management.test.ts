import assert from "node:assert/strict";
import { test } from "node:test";
import {
  csvCell, parsePatientDirectoryInput, parsePatientPage, parsePatientSearch, visitsToCsv,
} from "../lib/patient-management";

test("empty search opens the directory while nonempty searches reject filter injection", () => {
  assert.deepEqual(parsePatientSearch(""), { kind: "all" });
  assert.deepEqual(parsePatientSearch(" \t\n "), { kind: "all" });
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

test("directory defaults and choices are validated independently of visit history limits", () => {
  assert.deepEqual(parsePatientDirectoryInput({ query: "", page: 1 }), {
    search: { kind: "all" }, page: 1, pageSize: 10, profile: "all", sort: "newest",
  });
  assert.deepEqual(parsePatientDirectoryInput({
    query: "  أحمد   علي ", page: 1001, pageSize: 50, profile: "named", sort: "name_desc",
  }), {
    search: { kind: "name", term: "أحمد علي" }, page: 1001, pageSize: 50, profile: "named", sort: "name_desc",
  });
  for (const page of [-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parsePatientDirectoryInput({ query: "", page })?.page, 1);
  }
  assert.equal(parsePatientDirectoryInput({ query: "", page: Number.MAX_SAFE_INTEGER })?.page,
    Number.MAX_SAFE_INTEGER);
  for (const value of [
    null, [], {}, { query: [] }, { query: "Ahmed%" },
    { query: "", pageSize: "10" }, { query: "", pageSize: 1000 },
    { query: "", profile: "all),deleted_at.not.is.null" },
    { query: "", sort: "name.asc,phone.desc" }, { query: "", sort: "__proto__" },
  ]) {
    assert.equal(parsePatientDirectoryInput(value), null);
  }
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
