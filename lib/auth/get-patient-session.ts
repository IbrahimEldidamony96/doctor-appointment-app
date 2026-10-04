import "server-only";
import { cookies } from "next/headers";
import { verifyPatientJwt, type PatientJwtPayload } from "./patient-jwt";

const PATIENT_SESSION_COOKIE = "patient_session";

export async function getPatientSession(): Promise<PatientJwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PATIENT_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyPatientJwt(token);
}
