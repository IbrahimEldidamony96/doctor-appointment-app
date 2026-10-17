import { redirect } from "next/navigation";
import { Activity, BellRing, ClipboardList } from "lucide-react";
import { getClinicActor } from "@/lib/auth/clinic-actor";
import { hasPermission } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "سجل عمليات العيادة" };
export const dynamic = "force-dynamic";

const eventNames: Record<string, string> = {
  created: "إنشاء حجز", status_changed: "تغيير الحالة",
  rescheduled: "تغيير الموعد", soft_deleted: "حذف حجز",
};
const deliveryNames: Record<string, string> = {
  pending: "بانتظار الإرسال", processing: "جاري الإرسال", retry: "إعادة المحاولة",
  sent: "أُرسل", dead: "فشل نهائي", suppressed: "أُلغي بعد تحديث الحجز",
};
function formatTime(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

export default async function ClinicOperationsPage() {
  const actor = await getClinicActor();
  if (!actor || !hasPermission(actor.role, "operations:view"))
    redirect("/doctor-access-denied");

  const db = createServiceClient();
  const [audit, queue] = await Promise.all([
    db.from("appointment_audit_events")
      .select("id,appointment_id,actor,event_type,old_status,new_status,old_date,new_date,old_start_time,new_start_time,created_at")
      .order("id", { ascending: false }).limit(50),
    db.from("notification_outbox")
      .select("id,appointment_id,event_type,state,attempts,next_attempt_at,created_at,last_error")
      .order("created_at", { ascending: false }).limit(50),
  ]);
  if (audit.error || queue.error) return <p role="alert" className="status-error">
    مش قادر أحمّل سجل العيادة. تأكد إن Migration الخطوة السادسة متطبقة على قاعدة البيانات.
  </p>;

  const jobs = queue.data ?? [];
  return <div className="space-y-7">
    <div>
      <span className="eyebrow"><Activity size={16}/> الإدارة والمتابعة</span>
      <h1 className="mt-3 page-title">سجل العمليات والإشعارات</h1>
      <p className="page-desc">آخر 50 حدث وآخر 50 إشعار للطبيب فقط؛ بدون عرض الإيميلات أو أرقام المرضى.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="dash-card">
        <p className="text-xs text-slate-500">أحدث عمليات الحجز</p>
        <p className="mt-2 text-2xl font-extrabold">{audit.data?.length ?? 0}</p>
      </div>
      <div className="dash-card">
        <p className="text-xs text-slate-500">إشعارات أُرسلت ضمن آخر 50</p>
        <p className="mt-2 text-2xl font-extrabold">{jobs.filter(job => job.state === "sent").length}</p>
      </div>
      <div className="dash-card">
        <p className="text-xs text-slate-500">متعثرة ضمن آخر 50</p>
        <p className="mt-2 text-2xl font-extrabold">{jobs.filter(job => job.state === "retry" || job.state === "dead").length}</p>
      </div>
    </div>

    <section className="surface space-y-4 p-5 sm:p-7">
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><ClipboardList size={20}/> Audit Log</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[740px] text-right text-sm">
          <thead className="border-b text-slate-500">
            <tr><th className="py-3">الوقت</th><th>العملية</th><th>بواسطة</th><th>الحالة</th><th>الموعد</th></tr>
          </thead>
          <tbody>{(audit.data ?? []).map(item =>
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-3">{formatTime(item.created_at)}</td>
              <td>{eventNames[item.event_type] ?? item.event_type}</td>
              <td className="max-w-48 truncate font-mono text-xs" dir="ltr" title={item.actor}>{item.actor}</td>
              <td>{item.old_status ?? "—"} → {item.new_status ?? "—"}</td>
              <td><span dir="ltr">{item.new_date} {item.new_start_time?.slice(0,5)}</span></td>
            </tr>)}</tbody>
        </table>
        {!audit.data?.length && <p className="p-6 text-sm text-slate-500">مفيش أحداث لسه.</p>}
      </div>
    </section>
    <section className="surface space-y-4 p-5 sm:p-7">
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><BellRing size={20}/> Notification Outbox</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[730px] text-right text-sm">
          <thead className="border-b text-slate-500">
            <tr><th className="py-3">الوقت</th><th>الإشعار</th><th>الحالة</th><th>عدد المحاولات</th><th>المحاولة القادمة</th></tr>
          </thead>
          <tbody>{jobs.map(job =>
            <tr key={job.id} className="border-b last:border-0">
              <td className="py-3">{formatTime(job.created_at)}</td>
              <td dir="ltr" className="text-right">{job.event_type}</td>
              <td className={job.state === "dead" ? "font-bold text-red-700" : ""}>{deliveryNames[job.state] ?? job.state}</td>
              <td>{job.attempts} / 5</td>
              <td>{job.state === "retry" ? formatTime(job.next_attempt_at) : "—"}</td>
            </tr>)}</tbody>
        </table>
        {!jobs.length && <p className="p-6 text-sm text-slate-500">مفيش إشعارات مسجلة لسه.</p>}
      </div>
      <p className="text-xs text-slate-500">التسليم بيعتمد على مزود البريد. حالة «أُرسل» تعني قبول المزود للرسالة، مش بالضرورة فتحها أو قراءتها.</p>
    </section>
  </div>;
}
