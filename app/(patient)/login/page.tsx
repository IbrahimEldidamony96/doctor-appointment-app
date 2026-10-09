import { Suspense } from "react";
import { LoginForm } from "@/components/patient/login-form";
import { AuthShell } from "@/components/shared/auth-shell";
export const metadata = { title: "تسجيل الدخول" };
export default function LoginPage() {
  return <AuthShell step={1} title="أهلاً بيك في موعد 👋" subtitle="سجّل الدخول أو أنشئ حساب جديد باستخدام رقم الواتساب. هنرسل لك كود تحقق لتأكيد هويتك."><Suspense fallback={<p className="text-sm text-slate-500">جاري تحميل النموذج...</p>}><LoginForm/></Suspense></AuthShell>;
}
