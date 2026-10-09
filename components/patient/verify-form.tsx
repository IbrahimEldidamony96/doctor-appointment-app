"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safePatientRedirect } from "@/lib/auth/safe-redirect";

export function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get("phone") ?? "";
  const redirectTo = safePatientRedirect(params.get("redirect"));
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const loginUrl = `/login?redirect=${encodeURIComponent(redirectTo)}`;

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) { setError("الكود لازم يكون 6 أرقام."); return; }
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) { setError("رقم الهاتف غير صالح. ارجع وسجّل تاني."); return; }
    startTransition(async () => {
      try {
        const res = await fetch("/api/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }) });
        if (res.ok) { router.replace(redirectTo); router.refresh(); return; }
        const body = await res.json().catch(() => null);
        const messages: Record<string, string> = { expired: "انتهت صلاحية الكود. اطلب كود جديد.", invalid_code: "الكود غير صحيح، جرّب تاني.", too_many_attempts: "محاولات كثيرة. اطلب كود جديد.", not_found: "الكود غير موجود. اطلب واحد جديد.", invalid_input: "البيانات غير صحيحة." };
        setError(messages[body?.error] ?? "حصل خطأ أثناء التحقق، حاول تاني.");
      } catch { setError("تعذر الاتصال بالسيرفر. حاول تاني."); }
    });
  }
  function resend() {
    setError(null); setMessage(null);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) { setError("رقم غير صالح. ارجع لصفحة تسجيل الدخول."); return; }
    startTransition(async () => {
      try {
        const res = await fetch("/api/otp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
        const body = await res.json().catch(() => null);
        if (res.ok) { setMessage("تم إرسال كود جديد إلى رقم الواتساب."); return; }
        setError(body?.error === "too_many_requests" ? `تقدر تعيد الإرسال بعد ${Number(body.retryAfter) || 60} ثانية.` : "تعذر إعادة إرسال الكود.");
      } catch { setError("تعذر الاتصال بالسيرفر."); }
    });
  }
  return <form onSubmit={verify} className="space-y-5">
    <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">الكود اتبعت إلى <b dir="ltr" className="inline-block">{phone || "رقم غير محدد"}</b><Link href={loginUrl} className="ms-3 font-bold underline underline-offset-4">تغيير الرقم</Link></div>
    <div><Label htmlFor="code" className="field-label">رمز التحقق</Label><Input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required dir="ltr" placeholder="••••••" className="h-16 text-center text-2xl font-black tracking-[.55em]" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} aria-invalid={!!error} /></div>
    <p className="text-xs text-slate-500">الكود صالح لمدة 5 دقائق.</p>
    {error && <div role="alert" className="status-error">{error}</div>}
    {message && <div role="status" className="status-success">{message}</div>}
    <Button type="submit" size="lg" className="w-full" disabled={isPending || !/^\d{6}$/.test(code)}>{isPending ? "جاري التحقق..." : "تأكيد ومتابعة"}<ArrowLeft size={18}/></Button>
    <button type="button" disabled={isPending} onClick={resend} className="mx-auto flex items-center gap-2 text-sm font-bold text-teal-700 hover:text-teal-900 disabled:opacity-50"><RotateCw size={16}/> ماوصلكش الكود؟ أعد الإرسال</button>
  </form>;
}
