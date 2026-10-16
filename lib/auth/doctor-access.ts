/** Only explicitly allowlisted Clerk user IDs have doctor privileges. */
export function isDoctorUser(
  userId: string | null | undefined,
  allowlist = process.env.DOCTOR_CLERK_USER_IDS ?? "",
): boolean {
  if (!userId) return false;
  return allowlist.split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}

export const isAuthorizedDoctor = isDoctorUser;
