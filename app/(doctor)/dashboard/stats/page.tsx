import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";

type Stats = {
  total_appointments: number;
  completed_appointments: number;
  cancelled_appointments: number;
  no_show_appointments: number;
  cancellation_rate: number | null;
  total_revenue: number;
  revenue_this_month: number;
  average_rating: number | null;
  reviews_count: number;
};

export default async function StatsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createServiceClient();
  // Cast until `supabase gen types` is re-run after adding this function.
  const { data, error } = await supabase.rpc("get_dashboard_stats").single();
  const stats = data as Stats | null;

  if (error || !stats) {
    return <p className="text-sm text-red-600">تعذر تحميل الإحصاءات</p>;
  }

  const cards = [
    { label: "إجمالي المواعيد", value: stats.total_appointments },
    { label: "تمت", value: stats.completed_appointments },
    { label: "معدل الإلغاء", value: `${stats.cancellation_rate ?? 0}%` },
    { label: "لم يحضر", value: stats.no_show_appointments },
    { label: "الإيرادات (الكل)", value: `${stats.total_revenue} EGP` },
    { label: "الإيرادات (الشهر ده)", value: `${stats.revenue_this_month} EGP` },
    {
      label: "متوسط التقييم",
      value: stats.average_rating ? `${stats.average_rating} / 5` : "لا يوجد بعد",
    },
    { label: "عدد التقييمات", value: stats.reviews_count },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">الإحصاءات</h1>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-lg font-semibold">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
