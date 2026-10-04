"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/book";

  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setError("اكتب الرقم بصيغة دولية زي ‎+20xxxxxxxxxx");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      if (res.ok) {
        router.push(
          `/verify?phone=${encodeURIComponent(phone)}&redirect=${encodeURIComponent(redirectTo)}`
        );
        return;
      }

      const body = await res.json().catch(() => null);
      if (body?.error === "too_many_requests") {
        setError(`استنى ${body.retryAfter} ثانية وابعت تاني`);
      } else {
        setError("حصل خطأ، حاول تاني");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="phone" className="mb-1 block">
          رقم الواتساب
        </Label>
        <Input
          id="phone"
          type="tel"
          dir="ltr"
          placeholder="+20xxxxxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? "جاري الإرسال..." : "ابعت الكود"}
      </Button>
    </div>
  );
}
