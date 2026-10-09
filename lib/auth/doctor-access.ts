/** Server-side allowlist: a Clerk login alone must never grant clinic admin access.
 * Set DOCTOR_CLERK_USER_IDS to comma-separated Clerk user IDs in production. */
export function isAuthorizedDoctor(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allowed = (process.env.DOCTOR_CLERK_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
  return allowed.includes(userId);
}
