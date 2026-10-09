import "server-only";
import { auth } from "@clerk/nextjs/server";
import { isDoctorUser } from "./doctor-access";

export type DoctorSession = { userId: string };

export async function getDoctorSession(): Promise<DoctorSession | null> {
  const { userId } = await auth();
  return userId && isDoctorUser(userId) ? { userId } : null;
}

export async function requireDoctor(): Promise<DoctorSession> {
  const session = await getDoctorSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}
