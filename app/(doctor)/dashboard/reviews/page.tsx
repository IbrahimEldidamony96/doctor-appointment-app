import { auth } from "@clerk/nextjs/server";
import { isAuthorizedDoctor } from "@/lib/auth/doctor-access";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { ReviewVisibilityToggle } from "@/components/doctor/review-visibility-toggle";

export default async function DoctorReviewsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAuthorizedDoctor(userId)) redirect("/doctor-access-denied");

  const supabase = createServiceClient();
  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, rating, comment, is_published, created_at, patients(name)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-7">
      <h1 className="page-title">التقييمات</h1>

      {(!reviews || reviews.length === 0) && (
        <p className="surface p-8 text-sm text-muted-foreground">مفيش تقييمات لسه</p>
      )}

      <ul className="space-y-3">
        {reviews?.map((review) => (
          <li key={review.id} className="surface-sm p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <span className="font-medium">{"⭐".repeat(review.rating)}</span>
              <span className="text-sm text-muted-foreground">
                {review.is_published ? "ظاهر للعامة" : "مخفي"}
              </span>
            </div>
            <p className="mt-1 text-sm">{review.patients?.name ?? "مريض"}</p>
            {review.comment && (
              <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>
            )}
            <div className="mt-2">
              <ReviewVisibilityToggle reviewId={review.id} isPublished={review.is_published} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
