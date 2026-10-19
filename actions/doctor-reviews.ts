"use server";

import { revalidatePath } from "next/cache";
import { requireClinicPermission } from "@/lib/auth/clinic-actor";
import { createServiceClient } from "@/lib/supabase/server";

export async function toggleReviewPublished(id: string, isPublished: boolean) {
  if (!await requireClinicPermission("reviews:manage")) return { success: false as const, error: "unauthenticated" as const };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("reviews")
    .update({ is_published: isPublished })
    .eq("id", id);

  if (error) return { success: false as const, error: "unknown" as const };

  revalidatePath("/dashboard/reviews");
  return { success: true as const };
}
