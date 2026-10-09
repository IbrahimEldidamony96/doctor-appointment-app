import { Suspense } from "react";
import { VerifyForm } from "@/components/patient/verify-form";
import { AuthShell } from "@/components/shared/auth-shell";
export const metadata = { title: "تأكيد رقم الهاتف" };
export default function VerifyPage() { return <AuthShell step={2} title="أكد رقم الواتساب" subtitle="اكتب كود التحقق المكون من 6 أرقام المرسل لرقمك علشان نكمل تسجيل الدخول."><Suspense fallback={<p className="text-sm text-slate-500">جاري تحميل النموذج...</p>}><VerifyForm/></Suspense></AuthShell>; }
