import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedDoctor } from "./doctor-access";
import type { ClinicRole, ClinicPermission } from "./permissions";
import { hasPermission } from "./permissions";

export type ClinicActor = { clerkUserId: string; role: ClinicRole };

/** Re-read enabled membership each time; a disabled account loses access immediately. */
export async function getClinicActor(): Promise<ClinicActor | null> {
  const { userId } = await auth();
  if (!userId) return null;
  if (isAuthorizedDoctor(userId)) return { clerkUserId: userId, role: "doctor" };
  const { data, error } = await createServiceClient().from("staff_accounts")
    .select("role").eq("clerk_user_id", userId).eq("is_active", true).maybeSingle();
  if (error) {
    // Fail closed on missing migration, DB outage or malformed role.
    return null;
  }
  return data?.role === "secretary" ? { clerkUserId: userId, role: "secretary" } : null;
}

export async function requireClinicPermission(permission: ClinicPermission): Promise<ClinicActor | null> {
  const actor = await getClinicActor();
  return actor && hasPermission(actor.role, permission) ? actor : null;
}
