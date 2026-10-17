import type { AppointmentStatus } from "./supabase/database.types";

export const PATIENT_PAGE_SIZE = 10;
export const VISIT_PAGE_SIZE = 20;
export const MAX_PATIENT_PAGE = 1000;
export const MAX_EXPORT_VISITS = 1000;

export type PatientPageSize = 10 | 25 | 50;
export type PatientProfileFilter = "all" | "named" | "unnamed";
export type PatientSort = "newest" | "oldest" | "name_asc" | "name_desc" | "phone_asc" | "phone_desc";

export type PatientSearch =
  | { kind: "all" }
  | { kind: "name" | "phone"; term: string }
  | { kind: "invalid" };

export type PatientDirectoryInput = {
  query: string;
  page: number;
  pageSize?: PatientPageSize;
  profile?: PatientProfileFilter;
  sort?: PatientSort;
};

export type PatientDirectoryOptions = {
  search: Exclude<PatientSearch, { kind: "invalid" }>;
  page: number;
  pageSize: PatientPageSize;
  profile: PatientProfileFilter;
  sort: PatientSort;
};

export type PatientSearchRow = {
  id: string;
  name: string | null;
  phone: string;
  created_at: string;
};

export type PatientDirectory = {
  patients: PatientSearchRow[];
  count: number;
  page: number;
  pages: number;
  pageSize: PatientPageSize;
};

export type PatientDirectorySearchResult =
  | ({ success: true } & PatientDirectory)
  | { success: false; error: "forbidden" | "invalid_query" | "unknown" };

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
  if (!query) return { kind: "all" };
  if (query.length > 60) return { kind: "invalid" };
  if (/^\+?[0-9]+$/u.test(query)) {
    if (!/^\+?[0-9]{3,15}$/u.test(query)) return { kind: "invalid" };
    return { kind: "phone", term: query.startsWith("+") ? query : "+" + query };
  }
  // Characters that could change PostgREST/ILIKE filter semantics are rejected,
  // including %, _, *, \, commas and parentheses; Unicode Arabic marks work.
  if (!/^[\p{L}\p{M}\p{N} .'-]{2,60}$/u.test(query)) return { kind: "invalid" };
  return { kind: "name", term: query };
}

/** Validate public filter choices before any value reaches PostgREST. */
export function parsePatientDirectoryInput(value: unknown): PatientDirectoryOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.query !== "string") return null;
  const search = parsePatientSearch(input.query);
  if (search.kind === "invalid") return null;

  const pageSize = input.pageSize === undefined ? PATIENT_PAGE_SIZE : input.pageSize;
  if (pageSize !== 10 && pageSize !== 25 && pageSize !== 50) return null;
  const profile = input.profile === undefined ? "all" : input.profile;
  if (profile !== "all" && profile !== "named" && profile !== "unnamed") return null;
  const sort = input.sort === undefined ? "newest" : input.sort;
  if (sort !== "newest" && sort !== "oldest" && sort !== "name_asc" && sort !== "name_desc"
    && sort !== "phone_asc" && sort !== "phone_desc") return null;

  // The directory is clamped against its actual count, independent of the
  // history page limit. Every page advertised by the directory remains reachable.
  const page = typeof input.page === "number" && Number.isSafeInteger(input.page) && input.page > 0
    ? input.page : 1;
  return { search, page, pageSize, profile, sort };
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
