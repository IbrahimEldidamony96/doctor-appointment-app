"use client";
import { useState, useTransition, type FormEvent } from "react";
import { LogOut, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePatientProfile } from "@/actions/patient-profile";

export function ProfileForm({ initialName, initialEmail, phone }: { initialName: string; initialEmail: string; phone: string }) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setSuccess(false);
    startTransition(async () => {
      try { const result = await updatePatientProfile({ name, email }); if (result.success) setSuccess(true); else setError(result.error); }
      catch { setError("حدث خطأ غير متوقع، حاول تاني."); }
    });
  }
  function logout() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/patient/logout", { method: "POST" });
        if (!res.ok) throw new Error("logout failed");
        router.replace("/"); router.refresh();
      } catch { setError("تعذر تسجيل الخروج الآن."); }
    });
  }
  return <div className="surface p-6 sm:p-9"><form onSubmit={submit} className="space-y-6"><div><Label htmlFor="profile-name" className="field-label">الاسم الكامل</Label><Input id="profile-name" required autoComplete="name" minLength={2} maxLength={100} placeholder="اسمك الكامل" value={name} onChange={e => setName(e.target.value)}/></div><div><Label htmlFor="profile-email" className="field-label">البريد الإلكتروني (اختياري)</Label><Input id="profile-email" type="email" autoComplete="email" dir="ltr" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}/></div><div><Label htmlFor="profile-phone" className="field-label">رقم الواتساب</Label><Input id="profile-phone" dir="ltr" value={phone} disabled/><p className="mt-2 text-xs text-muted-foreground">رقمك مربوط بتسجيل الدخول ومش بيتغير من هنا.</p></div>{error && <p className="status-error" role="alert">{error}</p>}{success && <p className="status-success" role="status">تم تحديث بياناتك بنجاح.</p>}<Button type="submit" disabled={isPending} className="w-full sm:w-auto"><Save size={17}/>{isPending ? "جاري التنفيذ..." : "حفظ البيانات"}</Button></form><div className="mt-10 border-t pt-7"><h2 className="mb-2 font-bold">الجلسة الحالية</h2><p className="mb-4 text-sm text-muted-foreground">استخدم زر تسجيل الخروج لو بتستخدم جهاز مش جهازك.</p><Button type="button" variant="outline" onClick={logout} disabled={isPending}><LogOut size={17}/>تسجيل الخروج</Button></div></div>;
}
