"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-12">
      <h1 className="text-xl font-semibold">تعذر تحميل الصفحة</h1>
      <p className="text-sm text-muted-foreground">
        حصل خطأ أثناء تحميل البيانات. حاول تاني بعد قليل.
      </p>
      <Button onClick={reset}>حاول تاني</Button>
      <Link href="/" className="ms-4 text-sm underline">الصفحة الرئيسية</Link>
    </main>
  );
}
