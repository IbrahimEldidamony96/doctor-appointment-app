/** Pure role policy: used by backend guards and UI projection, never client claims. */
export type ClinicRole = "doctor" | "secretary";
export type ClinicPermission =
  | "dashboard:view"
  | "appointments:view"
  | "appointments:create_manual"
  | "appointments:reschedule"
  | "appointments:confirm"
  | "appointments:cancel"
  | "appointments:mark_visit"
  | "schedule:manage"
  | "reviews:manage"
  | "stats:view"
  | "settings:manage"
  | "staff:manage";

const secretaryPermissions: ReadonlySet<ClinicPermission> = new Set([
  "dashboard:view", "appointments:view", "appointments:create_manual", "appointments:reschedule", "appointments:confirm", "appointments:cancel",
]);

export function hasPermission(role: ClinicRole | null, permission: ClinicPermission): boolean {
  if (role === "doctor") return true;
  return role === "secretary" && secretaryPermissions.has(permission);
}

export function canChangeAppointmentStatus(
  role: ClinicRole | null,
  status: "confirmed" | "cancelled" | "completed" | "no_show",
): boolean {
  const permission = status === "confirmed" ? "appointments:confirm"
    : status === "cancelled" ? "appointments:cancel" : "appointments:mark_visit";
  return hasPermission(role, permission);
}
