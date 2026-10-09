import { redirect } from "next/navigation";
import { CalendarDays, CircleCheck, Clock3, ShieldCheck } from "lucide-react";
import { getPatientSession } from "@/lib/auth/get-patient-session";
import { getAvailableSlots } from "@/lib/availability";
import { createServiceClient } from "@/lib/supabase/server";
import { BookingForm } from "@/components/patient/booking-form";
export const metadata = { title: "احجز موعد" };
export default async function BookPage() {
  const session = await getPatientSession();
  if (!session) redirect("/login?redirect=/book");
  const [slots, patientResult] = await Promise.all([getAvailableSlots(new Date()), createServiceClient().from("patients").select("name").eq("id", session.patientId).maybeSingle()]);
  return <main className="container-app py-12 sm:py-16">
    <div className="mb-9"><span className="eyebrow"><CalendarDays size={15}/> حجز موعد جديد</span><h1 className="mt-4 page-title">خلّي زيارتك على معادك</h1><p className="page-desc">اختار من المواعيد المتاحة وأدخل تفاصيلك لتأكيد طلب الحجز.</p></div>
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="surface p-6 sm:p-9"><BookingForm slots={slots} initialName={patientResult.data?.name ?? ""}/></div>
      <aside className="space-y-5"><div className="surface-sm p-6"><h2 className="mb-5 text-lg font-extrabold">معلومات مهمة</h2><div className="space-y-5">{[{icon:CalendarDays,title:"اختار يومك",body:"الأيام الظاهرة هي الأيام المتاحة فعلاً للحجز."},{icon:Clock3,title:"اختار الوقت",body:"المواعيد بتتحدث حسب جدول العيادة والحجوزات."},{icon:CircleCheck,title:"اطلب الحجز",body:"بعد الحجز هتلاقي طلبك في صفحة مواعيدي."}].map(({icon:Icon,title,body})=><div className="flex items-start gap-3" key={title}><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon size={20}/></span><span><b className="block text-sm">{title}</b><span className="mt-1 block text-xs leading-6 text-muted-foreground">{body}</span></span></div>)}</div></div><div className="flex gap-3 rounded-2xl bg-teal-50 p-5 text-sm leading-7 text-teal-900"><ShieldCheck className="shrink-0"/> بياناتك محفوظة ومش هتظهر لأي مريض تاني.</div></aside>
    </div>
  </main>;
}
