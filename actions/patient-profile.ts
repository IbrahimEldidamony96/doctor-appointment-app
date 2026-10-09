"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { createServiceClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  name: z.string().trim().min(2, "الاسم لازم يكون حرفين على الأقل").max(100),
  email: z.union([z.email(), z.literal("")]),
});

export async function updatePatientProfile(input: { name: string; email: string }) {
  const session = await getPatientSession();
  if (!session) return { success: false as const, error: "سجّل دخول مرة أخرى." };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, error: "تأكد من الاسم والبريد الإلكتروني." };
  const { error } = await createServiceClient().from("patients").update({ name: parsed.data.name, email: parsed.data.email || null }).eq("id", session.patientId);
  if (error) return { success: false as const, error: "تعذر حفظ البيانات. حاول تاني." };
  revalidatePath("/profile");
  revalidatePath("/book");
  return { success: true as const };
}
