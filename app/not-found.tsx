import Link from "next/link";
import { SearchX } from "lucide-react";
export default function NotFound() { return <main dir="rtl" className="container-app grid min-h-screen place-items-center py-16"><div className="surface max-w-lg p-10 text-center"><SearchX className="mx-auto size-16 text-teal-500"/><h1 className="mt-6 text-3xl font-black">الصفحة مش موجودة</h1><p className="mt-3 text-sm text-muted-foreground">يمكن الرابط اتغيّر أو الصفحة اتحذفت.</p><Link href="/" className="mt-7 inline-flex rounded-xl bg-teal-700 px-6 py-3 font-bold text-white">العودة للرئيسية</Link></div></main>; }
