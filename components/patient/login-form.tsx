"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LockKeyhole, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safePatientRedirect } from "@/lib/auth/safe-redirect";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = safePatientRedirect(params.get("redirect"));
  const [phone, setPhone] = useState("+20");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalized = phone.replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setError("اكتب رقم واتساب صحيح مع مفتاح الدولة، مثل +201xxxxxxxxx");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/otp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: normalized }) });
        if (res.ok) {
          router.push(`/verify?phone=${encodeURIComponent(normalized)}&redirect=${encodeURIComponent(redirectTo)}`);
          return;
        }
        const body = await res.json().catch(() => null);
        setError(body?.error === "too_many_requests" ? `تم إرسال كود قريبًا. حاول بعد ${Number(body.retryAfter) || 60} ثانية.` : body?.error === "invalid_phone" ? "الرقم غير صحيح، راجعه وحاول تاني." : "تعذر إرسال الكود الآن، حاول مرة أخرى.");
      } catch { setError("تعذر الاتصال بالسيرفر. تأكد من الإنترنت وحاول تاني."); }
    });
  }
  return <form onSubmit={handleSubmit} className="space-y-5">
    <div><Label htmlFor="phone" className="field-label">رقم الواتساب</Label><div className="relative"><Smartphone size={19} className="absolute right-4 top-3.5 text-teal-700"/><Input id="phone" type="tel" inputMode="tel" autoComplete="tel" required dir="ltr" className="pr-4 pl-4 text-left" placeholder="+201xxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "login-error" : "login-phone-hint"}/></div><p id="login-phone-hint" className="mt-2 text-xs text-slate-500">اكتب الرقم الدولي من غير صفر بعد مفتاح الدولة.</p></div>
    {error && <div id="login-error" role="alert" className="status-error">{error}</div>}
    <Button type="submit" disabled={isPending} size="lg" className="w-full">{isPending ? "جاري إرسال الكود..." : "إرسال كود التحقق"}<ArrowLeft size={19}/></Button>
    <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500"><LockKeyhole size={14} className="text-teal-700"/> تسجيل الدخول وإنشاء الحساب بنفس الخطوات</p>
  </form>;
}
