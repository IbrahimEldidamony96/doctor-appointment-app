"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? "";
  const redirectTo = searchParams.get("redirect") ?? "/book";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);

    if (code.length !== 6) {
      setError("الكود لازم يكون 6 أرقام");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      if (res.ok) {
        router.push(redirectTo);
        router.refresh(); // re-render server components with the new session cookie
        return;
      }

      const body = await res.json().catch(() => null);
      const messages: Record<string, string> = {
        expired: "الكود انتهت صلاحيته، اطلب كود جديد",
        invalid_code: "الكود غلط",
        too_many_attempts: "حاولت كتير، اطلب كود جديد",
        not_found: "اطلب كود جديد",
      };
      setError(messages[body?.error] ?? "حصل خطأ، حاول تاني");
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">اتبعت كود على {phone}</p>

      <div>
        <Label htmlFor="code" className="mb-1 block">
          الكود
        </Label>
        <Input
          id="code"
          type="text"
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? "جاري التحقق..." : "تأكيد"}
      </Button>
    </div>
  );
}
