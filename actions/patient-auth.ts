"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/constants";

export async function logoutPatient(): Promise<never> {
  (await cookies()).delete(PATIENT_SESSION_COOKIE);
  redirect("/login");
}
