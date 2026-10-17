import type { AppointmentStatus } from "./supabase/database.types";

export const PATIENT_PAGE_SIZE = 25;
export const VISIT_PAGE_SIZE = 20;
export const MAX_PATIENT_PAGE = 1000;
export const MAX_EXPORT_VISITS = 1000;

export type PatientSearch =
  | { kind: "name" | "phone"; term: string }
  | { kind: "invalid" };

export type PatientSearchRow = {
  id: string;
  name: string | null;
  phone: string;
  created_at: string;
};

export type PatientVisit = {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  reason_for_visit: string | null;
};

export function parsePatientSearch(value: string): PatientSearch {
  const query = value.trim().replace(/\s+/gu, " ");
  // Search is opt-in: never dump the patient directory by default.
  if (!query || query.length > 60) return { kind: "invalid" };
  if (/^\+?[0-9]+$/u.test(query)) {
    if (!/^\+?[0-9]{3,15}$/u.test(query)) return { kind: "invalid" };
    return { kind: "phone", term: query.startsWith("+") ? query : "+" + query };
  }
  // Characters that could change PostgREST/ILIKE filter semantics are rejected,
  // including %, _, *, \, commas and parentheses; Unicode Arabic marks work.
  if (!/^[\p{L}\p{M}\p{N} .'-]{2,60}$/u.test(query)) return { kind: "invalid" };
  return { kind: "name", term: query };
}

export function parsePatientPage(value: number | string | undefined): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(num) || num < 1 || num > MAX_PATIENT_PAGE) return 1;
  return num;
}

/** Escape all untrusted CSV content, including Excel formula-leading cells. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function visitsToCsv(
  patient: { name: string | null; phone: string; email: string | null },
  visits: readonly PatientVisit[],
): string {
  const headers = ["Patient name", "Phone", "Email", "Date", "Start", "End", "Status", "Reason"];
  const rows = [headers, ...visits.map(visit => [
    patient.name ?? "", patient.phone, patient.email ?? "",
    visit.appointment_date, visit.start_time, visit.end_time,
    visit.status, visit.reason_for_visit ?? "",
  ])];
  return "\uFEFF" + rows.map(cells => cells.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
