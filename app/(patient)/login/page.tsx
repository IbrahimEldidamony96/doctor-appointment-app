import { Suspense } from "react";
import { LoginForm } from "@/components/patient/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-xl font-semibold">تسجيل الدخول</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
