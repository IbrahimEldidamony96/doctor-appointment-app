import Link from "next/link";
import { ShieldAlert } from "lucide-react";
export const metadata = { title: "غير مصرح بالدخول" };
export default function AccessDeniedPage() { return <main className="grid min-h-screen place-items-center p-6" dir="rtl"><div className="surface max-w-md p-10 text-center"><ShieldAlert className="mx-auto size-14 text-amber-600"/><h1 className="mt-5 text-2xl font-extrabold">غير مصرح بالدخول</h1><p className="mt-3 text-sm leading-8 text-muted-foreground">حساب Clerk الحالي مش مضاف لقائمة حسابات إدارة العيادة. تواصل مع مسؤول المشروع علشان يسمح له بالدخول.</p><Link href="/" className="mt-6 inline-block rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white">رجوع للرئيسية</Link></div></main>; }
