import "server-only";

export function getAuthSecret(name: "PATIENT_JWT_SECRET" | "OTP_HASH_SECRET"): Uint8Array {
  const secret = process.env[name];
  const key = new TextEncoder().encode(secret);
  if (!secret || key.byteLength < 32) {
    throw new Error(`${name} must contain at least 32 bytes`);
  }
  return key;
}
