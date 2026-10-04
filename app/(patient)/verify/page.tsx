import { Suspense } from "react";
import { VerifyForm } from "@/components/patient/verify-form";

export default function VerifyPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-xl font-semibold">أدخل الكود</h1>
      <Suspense>
        <VerifyForm />
      </Suspense>
    </main>
  );
}
