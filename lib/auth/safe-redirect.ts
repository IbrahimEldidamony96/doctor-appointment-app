/** Only permit internal patient destinations; never redirect users to an arbitrary origin. */
export function safePatientRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return "/book";
  const path = value.split(/[?#]/)[0];
  if (["/book", "/my-appointments", "/profile", "/payment"].some((base) => path === base || path.startsWith(`${base}/`))) return value;
  return "/book";
}
