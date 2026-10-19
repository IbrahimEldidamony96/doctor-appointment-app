import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getPatientSession } from "./get-patient-session";
import type { PatientJwtPayload } from "./patient-jwt";
import type { ClinicRole, ClinicPermission } from "./permissions";
import { hasPermission } from "./permissions";

export type ClinicActor = { id: string; phone: string; role: ClinicRole; isOwner: boolean };

/** The identity must come from a verified OTP or signed session, never request input. */
export async function getClinicActorForIdentity(identity: PatientJwtPayload | null): Promise<ClinicActor | null> {
  if (!identity) return null;
  const { data, error } = await createServiceClient().from("staff_accounts")
    .select("id,phone,role,is_active,is_owner").eq("phone", identity.phone).eq("is_active", true).maybeSingle();
  if (error) throw new Error("Clinic membership unavailable");
  if (!data || !data.is_active || data.phone !== identity.phone
    || !["doctor", "nurse", "secretary"].includes(data.role)) return null;
  return { id: data.id, phone: identity.phone, role: data.role, isOwner: data.is_owner };
}

/** Re-read membership on every request so disabling staff immediately removes access. */
export async function getClinicActor(): Promise<ClinicActor | null> {
  try {
    return await getClinicActorForIdentity(await getPatientSession());
  } catch {
    return null;
  }
}

export async function requireClinicPermission(permission: ClinicPermission): Promise<ClinicActor | null> {
  const actor = await getClinicActor();
  return actor && hasPermission(actor.role, permission) ? actor : null;
}
