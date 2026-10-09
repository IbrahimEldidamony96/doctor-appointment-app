"use client";
import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function PatientError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="container-app grid min-h-[55vh] place-items-center py-14"><div className="surface max-w-md p-10 text-center"><AlertCircle className="mx-auto size-14 text-red-500"/><h1 className="mt-5 text-2xl font-extrabold">تعذر تحميل الصفحة</h1><p className="mt-3 text-sm leading-8 text-muted-foreground">حدث خطأ غير متوقع. جرّب مرة أخرى ولو استمر، تواصل مع العيادة.</p><div className="mt-7 flex justify-center gap-3"><Button onClick={reset}><RotateCcw/>إعادة المحاولة</Button><Link href="/" className="inline-flex items-center rounded-xl border px-5 text-sm font-bold">الرئيسية</Link></div></div></main>; }
