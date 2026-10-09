"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { isAuthorizedDoctor } from "@/lib/auth/doctor-access";
import { createServiceClient } from "@/lib/supabase/server";

export async function toggleReviewPublished(id: string, isPublished: boolean) {
  const { userId } = await auth();
  if (!isAuthorizedDoctor(userId)) return { success: false as const, error: "unauthenticated" as const };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("reviews")
    .update({ is_published: isPublished })
    .eq("id", id);

  if (error) return { success: false as const, error: "unknown" as const };

  revalidatePath("/dashboard/reviews");
  return { success: true as const };
}
