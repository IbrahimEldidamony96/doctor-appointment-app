import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { PATIENT_ID_PATTERN, PHONE_PATTERN, PATIENT_SESSION_MAX_AGE_SECONDS } from "./constants";
import { getAuthSecret } from "./secrets";

const ISSUER = "clinic-whatsapp-auth";
const AUDIENCE = "clinic-user";

export type PatientJwtPayload = { patientId: string; phone: string };

function validIdentity(value: unknown): value is PatientJwtPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.patientId === "string" && PATIENT_ID_PATTERN.test(payload.patientId)
    && typeof payload.phone === "string" && PHONE_PATTERN.test(payload.phone);
}

export async function signPatientJwt(payload: PatientJwtPayload): Promise<string> {
  if (!validIdentity(payload)) throw new Error("Invalid patient identity");
  return new SignJWT({ patientId: payload.patientId, phone: payload.phone })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + PATIENT_SESSION_MAX_AGE_SECONDS)
    .sign(getAuthSecret("PATIENT_JWT_SECRET"));
}

export async function verifyPatientJwt(token: string): Promise<PatientJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret("PATIENT_JWT_SECRET"), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      requiredClaims: ["exp", "iat", "iss", "aud"],
    });
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number"
      || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)
      || payload.iat > now + 5 || payload.exp <= payload.iat
      || payload.exp > payload.iat + PATIENT_SESSION_MAX_AGE_SECONDS) return null;
    if (!validIdentity(payload)) return null;
    return { patientId: payload.patientId, phone: payload.phone };
  } catch {
    return null;
  }
}
