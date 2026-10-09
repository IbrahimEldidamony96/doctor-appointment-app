/** Keep patient login redirects within implemented patient pages. */
export function getSafePatientRedirect(value: string | null | undefined): string {
  return value === "/book" || value === "/my-appointments" ? value : "/book";
}
