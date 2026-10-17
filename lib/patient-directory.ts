import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClinicActor } from "./auth/clinic-actor";
import { hasPermission } from "./auth/permissions";
import type { Database } from "./supabase/database.types";
import {
  parsePatientDirectoryInput, type PatientDirectory, type PatientDirectoryOptions,
  type PatientDirectorySearchResult, type PatientSort,
} from "./patient-management";

type DirectoryClient = SupabaseClient<Database, "clinic">;

/** The action supplies a freshly authenticated actor for every call. */
export async function searchPatientDirectory(
  actor: ClinicActor | null,
  input: unknown,
  createDb: () => DirectoryClient,
): Promise<PatientDirectorySearchResult> {
  if (!actor || !hasPermission(actor.role, "patients:search"))
    return { success: false, error: "forbidden" };
  const options = parsePatientDirectoryInput(input);
  if (!options) return { success: false, error: "invalid_query" };
  try {
    const directory = await loadPatientDirectory(createDb(), options);
    return directory ? { success: true, ...directory } : { success: false, error: "unknown" };
  } catch {
    return { success: false, error: "unknown" };
  }
}

const directoryOrders: Record<PatientSort, { column: "created_at" | "name" | "phone"; ascending: boolean }> = {
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  name_asc: { column: "name", ascending: true },
  name_desc: { column: "name", ascending: false },
  phone_asc: { column: "phone", ascending: true },
  phone_desc: { column: "phone", ascending: false },
};

async function loadPatientDirectory(
  db: DirectoryClient,
  options: PatientDirectoryOptions,
): Promise<PatientDirectory | null> {
  const filteredQuery = (head = false) => {
    let query = db.from("patients")
      .select("id,name,phone,created_at", head ? { count: "exact", head: true } : undefined)
      .is("deleted_at", null);
    if (options.search.kind === "phone") {
      query = query.like("phone", options.search.term + "%");
    } else if (options.search.kind === "name") {
      query = query.ilike("name", "%" + options.search.term + "%");
    }
    // Fixed expressions classify blank/whitespace-only names without embedding
    // any user input in PostgREST's logical-filter syntax.
    if (options.profile === "named") {
      query = query.filter("name", "match", "[^[:space:]]");
    } else if (options.profile === "unnamed") {
      query = query.or('name.is.null,name.not.match."[^[:space:]]"');
    }
    return query;
  };

  // Count first so huge/stale page requests never produce an invalid range.
  // HEAD returns no patient rows, and the subsequent GET stays page-sized.
  const { count, error: countError } = await filteredQuery(true);
  if (countError || count === null || !Number.isSafeInteger(count) || count < 0) return null;
  const pages = Math.max(1, Math.ceil(count / options.pageSize));
  const page = Math.min(options.page, pages);
  if (count === 0) return { patients: [], count, page, pages, pageSize: options.pageSize };

  const order = directoryOrders[options.sort];
  const start = (page - 1) * options.pageSize;
  const { data, error } = await filteredQuery()
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .order("id", { ascending: true })
    .range(start, Math.min(start + options.pageSize - 1, count - 1));
  if (error || !data) return null;
  return { patients: data, count, page, pages, pageSize: options.pageSize };
}
