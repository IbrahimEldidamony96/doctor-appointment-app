const patientDestinations = ["/book", "/my-appointments", "/profile", "/payment"];

function allowedRedirect(value: string | null | undefined, destinations: string[], fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")
    || /[\u0000-\u0020\u007f]/.test(value)) return fallback;
  const path = value.split(/[?#]/)[0];
  // Check the normalized URL too: /dashboard/../../other must not bypass the allowlist.
  const normalized = new URL(value, "https://clinic.invalid");
  if (normalized.origin !== "https://clinic.invalid" || normalized.pathname !== path) return fallback;
  if (destinations.some((base) => path === base || path.startsWith(`${base}/`))) return value;
  return fallback;
}

/** Only permit implemented internal patient destinations. */
export function safePatientRedirect(value: string | null | undefined): string {
  return allowedRedirect(value, patientDestinations, "/book");
}

/** A destination is navigation only; dashboard permissions are always checked on the server. */
export function safeLoginRedirect(value: string | null | undefined, fallback = "/book"): string {
  return allowedRedirect(value, [...patientDestinations, "/dashboard"], fallback);
}

export function getLoginDestination(value: string | null | undefined, isStaff: boolean): string {
  const destination = safeLoginRedirect(value, isStaff ? "/dashboard" : "/book");
  const pathname = destination.split(/[?#]/)[0];
  return !isStaff && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))
    ? "/doctor-access-denied" : destination;
}
