"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportClinicPatientHistory } from "@/actions/staff-patients";

const messages = {
  forbidden: "التصدير متاح للطبيب فقط.",
  invalid_input: "معرّف المريض غير صالح.",
  not_found: "المريض غير موجود.",
  too_many_visits: "عدد الزيارات أكبر من الحد المسموح لتصدير واحد (1000).",
  unknown: "تعذر تجهيز الملف أو تسجيل التصدير.",
};

export function PatientHistoryExport({ patientId }: { patientId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function download() {
    setError("");
    startTransition(async () => {
      try {
        const result = await exportClinicPatientHistory(patientId);
        if (!result.success) { setError(messages[result.error]); return; }
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = result.filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        setError("تعذر تنزيل الملف.");
      }
    });
  }

  return <div className="space-y-2">
    <Button variant="outline" size="sm" type="button" disabled={pending} onClick={download}>
      <Download size={16}/>{pending ? "جاري تجهيز التقرير..." : "تصدير سجل الزيارات CSV"}
    </Button>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
