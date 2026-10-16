import "server-only";
import { cookies } from "next/headers";
import { PATIENT_SESSION_COOKIE } from "./constants";
import { verifyPatientJwt, type PatientJwtPayload } from "./patient-jwt";

export async function getPatientSession(): Promise<PatientJwtPayload | null> {
  const token = (await cookies()).get(PATIENT_SESSION_COOKIE)?.value;
  return token ? verifyPatientJwt(token) : null;
}
