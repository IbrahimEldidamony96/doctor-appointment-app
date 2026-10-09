import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  let clinicName = "العيادة";
  let reviews: { id: string; rating: number; comment: string | null }[] = [];
  let reviewsUnavailable = false;

  try {
    const supabase = createServiceClient();
    const [settingsResult, reviewsResult] = await Promise.all([
      supabase.from("settings").select("clinic_name").maybeSingle(),
      supabase.from("reviews").select("id, rating, comment, patients!inner(id), appointments!inner(id)")
        .eq("is_published", true).is("patients.deleted_at", null).is("appointments.deleted_at", null)
        .order("created_at", { ascending: false }).limit(6),
    ]);
    clinicName = settingsResult.data?.clinic_name ?? clinicName;
    reviews = reviewsResult.data ?? [];
    reviewsUnavailable = Boolean(reviewsResult.error);
  } catch {
    reviewsUnavailable = true;
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold">{clinicName}</h1>
        <p className="text-muted-foreground">احجز موعدك وتابع زياراتك من مكان واحد.</p>
        <nav aria-label="خدمات العيادة" className="flex flex-wrap gap-3">
          <Link href="/book" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">احجز موعد</Link>
          <Link href="/my-appointments" className="rounded-lg border px-4 py-2">مواعيدي</Link>
          <Link href="/sign-in" className="rounded-lg border px-4 py-2">دخول الطبيب</Link>
        </nav>
        <p className="text-sm text-muted-foreground">دخول المرضى بكود يُرسل إلى رقم الواتساب. كل المواعيد بتوقيت القاهرة.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">تقييمات الزيارات</h2>
        {reviewsUnavailable ? (
          <p className="text-sm text-muted-foreground">التقييمات غير متاحة حاليًا.</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">مفيش تقييمات منشورة لسه.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {reviews.map((review) => (
              <li key={review.id} className="space-y-2 rounded-lg border p-4">
                <p aria-label={`${review.rating} من 5`}>{"⭐".repeat(review.rating)}</p>
                {review.comment && <p className="break-words text-sm">{review.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
