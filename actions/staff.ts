"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { createServiceClient } from "@/lib/supabase/server";
import { PHONE_PATTERN } from "@/lib/auth/constants";
import type { ClinicRole } from "@/lib/auth/permissions";

const createSchema = z.object({
  phone: z.string().max(32).transform(value => value.replace(/[\s()-]/g, "")).pipe(z.string().regex(PHONE_PATTERN)),
  displayName: z.string().trim().min(2).max(100),
  role: z.enum(["doctor", "nurse", "secretary"]),
}).strict();
const toggleSchema = z.object({ id: z.string().min(1).max(128), isActive: z.boolean() }).strict();
export type StaffRecord = {
  id: string; phone: string | null; display_name: string; role: ClinicRole;
  is_active: boolean; is_owner: boolean; created_at: string;
};
type StaffActionError = "forbidden" | "invalid_input" | "already_exists" | "not_found" | "unknown";
export type StaffActionResult =
  | { success: true }
  | { success: false; error: StaffActionError };

export async function addStaff(input: z.input<typeof createSchema>): Promise<
  { success: true; staff: StaffRecord } | { success: false; error: StaffActionError }
> {
  const actor = await getClinicActor();
  if (!actor || actor.role !== "doctor") return { success: false, error: "forbidden" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success || parsed.data.phone === actor.phone) {
    return { success: false, error: "invalid_input" };
  }
  // Approval is saved before the employee signs in; OTP must still verify their number.
  const { data, error } = await createServiceClient().from("staff_accounts").insert({
    phone: parsed.data.phone,
    display_name: parsed.data.displayName,
    role: parsed.data.role, is_active: true, is_owner: false,
    created_by: actor.id,
    updated_by: actor.id,
  }).select("id,phone,display_name,role,is_active,is_owner,created_at").single();
  if (error) return { success: false, error: error.code === "23505" ? "already_exists" : "unknown" };
  if (!data) return { success: false, error: "unknown" };
  revalidatePath("/dashboard/staff");
  return { success: true, staff: data };
}

export async function setStaffActive(input: z.infer<typeof toggleSchema>): Promise<StaffActionResult> {
  const actor = await getClinicActor();
  if (!actor || actor.role !== "doctor") return { success: false, error: "forbidden" };
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success || parsed.data.id === actor.id) {
    return { success: false, error: "invalid_input" };
  }
  const { data, error } = await createServiceClient().from("staff_accounts")
    .update({ is_active: parsed.data.isActive, updated_by: actor.id })
    .eq("id", parsed.data.id).eq("is_owner", false).not("phone", "is", null)
    .select("id").maybeSingle();
  if (error) return { success: false, error: "unknown" };
  if (!data) return { success: false, error: "not_found" };
  revalidatePath("/dashboard/staff");
  return { success: true };
}
