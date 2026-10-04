import "server-only";
import { SignJWT, jwtVerify } from "jose";

const JWT_ALG = "HS256";
const SESSION_DAYS = 30;

function getSecretKey() {
  const secret = process.env.PATIENT_JWT_SECRET;
  if (!secret) throw new Error("Missing PATIENT_JWT_SECRET");
  return new TextEncoder().encode(secret);
}

export type PatientJwtPayload = {
  patientId: string;
  phone: string;
};

/**
 * Uses jose (not jsonwebtoken) because it runs on both the Node
 * and Edge runtimes — middleware.ts runs on Edge, and it'll need
 * to call verifyPatientJwt() to protect patient routes.
 */
export async function signPatientJwt(payload: PatientJwtPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecretKey());
}

export async function verifyPatientJwt(
  token: string
): Promise<PatientJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: [JWT_ALG],
    });

    if (typeof payload.patientId !== "string" || typeof payload.phone !== "string") {
      return null;
    }

    return { patientId: payload.patientId, phone: payload.phone };
  } catch {
    return null;
  }
}
