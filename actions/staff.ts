"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedDoctor } from "@/lib/auth/doctor-access";

const clerkId = z.string().regex(/^user_[A-Za-z0-9]{8,}$/).max(128);
const createSchema = z.object({
  clerkUserId: clerkId,
  displayName: z.string().trim().min(2).max(100),
});
const toggleSchema = z.object({ clerkUserId: clerkId, isActive: z.boolean() });
export type StaffActionResult =
  | { success: true }
  | { success: false; error: "forbidden" | "invalid_input" | "user_not_found" | "already_exists" | "not_found" | "unknown" };

export async function addSecretary(input: z.infer<typeof createSchema>): Promise<StaffActionResult> {
  const actor = await getClinicActor();
  if (!actor || actor.role !== "doctor") return { success: false, error: "forbidden" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success || isAuthorizedDoctor(parsed.data.clerkUserId)) {
    return { success: false, error: "invalid_input" };
  }
  // Only existing Clerk identities can be granted staff access.
  try {
    const client = await clerkClient();
    const identity = await client.users.getUser(parsed.data.clerkUserId);
    if (!identity || identity.banned || identity.locked) return { success: false, error: "user_not_found" };
  } catch (error: unknown) {
    const status = (error as { status?: number } | null)?.status;
    return { success: false, error: status === 404 ? "user_not_found" : "unknown" };
  }

  const { error } = await createServiceClient().from("staff_accounts").insert({
    clerk_user_id: parsed.data.clerkUserId,
    display_name: parsed.data.displayName,
    role: "secretary", is_active: true,
    created_by_clerk_user_id: actor.clerkUserId,
    updated_by_clerk_user_id: actor.clerkUserId,
  });
  if (error) return { success: false, error: error.code === "23505" ? "already_exists" : "unknown" };
  revalidatePath("/dashboard/staff");
  return { success: true };
}

export async function setSecretaryActive(input: z.infer<typeof toggleSchema>): Promise<StaffActionResult> {
  const actor = await getClinicActor();
  if (!actor || actor.role !== "doctor") return { success: false, error: "forbidden" };
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success || isAuthorizedDoctor(parsed.data.clerkUserId)) {
    return { success: false, error: "invalid_input" };
  }
  const { data, error } = await createServiceClient().from("staff_accounts")
    .update({ is_active: parsed.data.isActive, updated_by_clerk_user_id: actor.clerkUserId })
    .eq("clerk_user_id", parsed.data.clerkUserId)
    .eq("role", "secretary")
    .select("clerk_user_id").maybeSingle();
  if (error) return { success: false, error: "unknown" };
  if (!data) return { success: false, error: "not_found" };
  revalidatePath("/dashboard/staff");
  return { success: true };
}
