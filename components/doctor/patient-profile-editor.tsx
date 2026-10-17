"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClinicPatient } from "@/actions/staff-patients";

export function PatientProfileEditor({
  patientId, name: originalName, email: originalEmail, updatedAt,
}: {
  patientId: string; name: string; email: string; updatedAt: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(originalName);
  const [email, setEmail] = useState(originalEmail);
  const [version, setVersion] = useState(updatedAt);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    startTransition(async () => {
      try {
        const result = await updateClinicPatient({
          patientId, expectedUpdatedAt: version, name: name.trim(), email: email.trim(),
        });
        if (!result.success) {
          const messages = {
            forbidden: "تعديل بيانات المريض مسموح للطبيب فقط.",
            invalid_input: "راجع الاسم والبريد الإلكتروني.",
            not_found: "المريض لم يعد متاحًا.",
            stale: "بيانات المريض اتعدلت من شاشة تانية. حدّث الصفحة قبل حفظ أي تغييرات.",
            unknown: "تعذر حفظ البيانات حاليًا.",
          };
          setNotice(messages[result.error]);
          return;
        }
        setVersion(result.updatedAt);
        setNotice("تم تحديث بيانات المريض وتسجيل التعديل.");
        router.refresh();
      } catch {
        setNotice("تعذر الاتصال بالسيرفر.");
      }
    });
  }

  return <form onSubmit={submit} className="surface-sm space-y-5 p-5 sm:p-6">
    <h2 className="text-lg font-extrabold">تعديل البيانات الأساسية</h2>
    <p className="text-sm text-slate-500">
      التعديل متاح للطبيب فقط. رقم الموبايل الموثّق مش قابل للتغيير من هنا.
    </p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="clinic-patient-name">اسم المريض</Label>
        <Input id="clinic-patient-name" required minLength={2} maxLength={100}
          value={name} onChange={event => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clinic-patient-email">البريد الإلكتروني (اختياري)</Label>
        <Input id="clinic-patient-email" type="email" dir="ltr" maxLength={254}
          value={email} onChange={event => setEmail(event.target.value)} />
      </div>
    </div>
    {notice && <p role="status" className="rounded-xl bg-slate-50 p-3 text-sm">{notice}</p>}
    <Button type="submit" disabled={pending}>{pending ? "جاري الحفظ..." : "حفظ التغييرات"}</Button>
  </form>;
}
