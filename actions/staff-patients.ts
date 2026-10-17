"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import {
  MAX_EXPORT_VISITS, PATIENT_PAGE_SIZE, parsePatientSearch, parsePatientPage,
  visitsToCsv, type PatientSearchRow, type PatientVisit,
} from "@/lib/patient-management";

export type PatientSearchResult =
  | { success: true; patients: PatientSearchRow[]; count: number; page: number; pages: number }
  | { success: false; error: "forbidden" | "invalid_query" | "unknown" };

export async function searchClinicPatients(input: {
  query: string; page: number;
}): Promise<PatientSearchResult> {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "patients:search"))
    return { success: false, error: "forbidden" };

  if (!input || typeof input.query !== "string") return { success: false, error: "invalid_query" };
  const parsed = parsePatientSearch(input.query);
  if (parsed.kind === "invalid") return { success: false, error: "invalid_query" };
  const page = parsePatientPage(input.page);

  let query = createServiceClient().from("patients")
    .select("id,name,phone,created_at", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (parsed.kind === "phone") {
    query = query.like("phone", parsed.term + "%");
  } else {
    query = query.ilike("name", "%" + parsed.term + "%");
  }
  const start = (page - 1) * PATIENT_PAGE_SIZE;
  const { data, error, count } = await query.range(start, start + PATIENT_PAGE_SIZE - 1);
  if (error || !data || count === null) return { success: false, error: "unknown" };
  return {
    success: true, patients: data, count,
    page, pages: Math.ceil(count / PATIENT_PAGE_SIZE),
  };
}

const profileSchema = z.object({
  patientId: z.string().uuid(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(2).max(100),
  email: z.union([z.email().max(254), z.literal("")]),
});
export type PatientProfileUpdate = z.infer<typeof profileSchema>;
export type PatientProfileResult =
  | { success: true; updatedAt: string }
  | { success: false; error: "forbidden" | "invalid_input" | "not_found" | "stale" | "unknown" };

export async function updateClinicPatient(input: PatientProfileUpdate): Promise<PatientProfileResult> {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "patients:manage"))
    return { success: false, error: "forbidden" };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "invalid_input" };
  const p = parsed.data;
  const { data, error } = await createServiceClient().rpc("update_staff_patient_profile", {
    p_actor_clerk_user_id: actor.clerkUserId,
    p_patient_id: p.patientId,
    p_expected_updated_at: p.expectedUpdatedAt,
    p_name: p.name,
    p_email: p.email.toLowerCase(),
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { success: false, error: "unknown" };
  }
  const result = data as { success?: boolean; reason?: string; updated_at?: string };
  if (!result.success) {
    if (result.reason === "stale" || result.reason === "not_found" || result.reason === "invalid_input")
      return { success: false, error: result.reason };
    return { success: false, error: "unknown" };
  }
  if (typeof result.updated_at !== "string") return { success: false, error: "unknown" };
  revalidatePath("/dashboard/patients/" + p.patientId);
  revalidatePath("/dashboard/appointments");
  revalidatePath("/dashboard/calendar");
  return { success: true, updatedAt: result.updated_at };
}

export type PatientExportResult =
  | { success: true; csv: string; filename: string }
  | { success: false; error: "forbidden" | "invalid_input" | "not_found" | "too_many_visits" | "unknown" };

export async function exportClinicPatientHistory(patientId: string): Promise<PatientExportResult> {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "patients:export"))
    return { success: false, error: "forbidden" };
  if (!z.string().uuid().safeParse(patientId).success)
    return { success: false, error: "invalid_input" };

  const db = createServiceClient();
  const { data: patient, error: patientError } = await db.from("patients")
    .select("id,name,phone,email").eq("id", patientId).is("deleted_at", null).maybeSingle();
  if (patientError) return { success: false, error: "unknown" };
  if (!patient) return { success: false, error: "not_found" };

  const { data, error, count } = await db.from("appointments")
    .select("id,appointment_date,start_time,end_time,status,reason_for_visit", { count: "exact" })
    .eq("patient_id", patientId).is("deleted_at", null)
    .order("appointment_date", { ascending: false })
    .order("start_time", { ascending: false })
    .order("id", { ascending: false })
    .range(0, MAX_EXPORT_VISITS - 1);
  if (error || !data || count === null) return { success: false, error: "unknown" };
  if (count > MAX_EXPORT_VISITS) return { success: false, error: "too_many_visits" };

  const csv = visitsToCsv(patient, data as PatientVisit[]);
  // Export fails closed when its audit record cannot be committed.
  const { error: auditError } = await db.from("patient_management_audit").insert({
    patient_id: patientId,
    actor_clerk_user_id: actor.clerkUserId,
    action: "history_exported",
  });
  if (auditError) return { success: false, error: "unknown" };
  return { success: true, csv, filename: "patient-appointments-" + patientId + ".csv" };
}
