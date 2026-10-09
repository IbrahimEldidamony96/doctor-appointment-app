import Link from "next/link";
import { CalendarCheck2, HeartPulse, Menu, ShieldCheck, ArrowUpLeft, LogIn, UserRound } from "lucide-react";
import { getPatientSession } from "@/lib/auth/get-patient-session";

const links = [
  { href: "/", label: "الرئيسية" },
  { href: "/book", label: "احجز موعد" },
  { href: "/my-appointments", label: "مواعيدي" },
  { href: "/reviews", label: "آراء المرضى" },
  { href: "/contact", label: "تواصل معنا" },
];

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const session = await getPatientSession();
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-teal-900 bg-[#0d343e] py-2 text-center text-xs font-medium text-white/80">
        <span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> بياناتك وخصوصيتك أولوية لنا</span>
      </div>
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="container-app flex h-19 items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="موعد - الصفحة الرئيسية">
            <span className="grid size-11 place-items-center rounded-2xl bg-teal-700 text-white"><HeartPulse size={24} strokeWidth={2.5} /></span>
            <span className="text-2xl font-black tracking-tight text-[#103b47]">موعد<span className="text-teal-600">.</span></span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="القائمة الرئيسية">
            {links.map((item) => <Link key={item.href} href={item.href} className="pill-link">{item.label}</Link>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link href={session ? "/profile" : "/login"} className="pill-link hidden sm:inline-flex">
              {session ? <UserRound size={17} /> : <LogIn size={17} />}
              {session ? "حسابي" : "تسجيل الدخول"}
            </Link>
            <Link href="/book" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-teal-700 px-3 text-sm font-bold text-white transition hover:bg-teal-800 sm:px-4">احجز الآن <ArrowUpLeft size={16} /></Link>
            <details className="group relative lg:hidden">
              <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-xl border bg-white text-slate-800" aria-label="افتح القائمة"><Menu size={20}/></summary>
              <nav className="absolute left-0 top-12 z-50 flex w-56 flex-col rounded-2xl border bg-white p-2 shadow-xl" aria-label="قائمة الموبايل">
                {links.map((item) => <Link key={item.href} href={item.href} className="pill-link justify-start">{item.label}</Link>)}
                <Link href={session ? "/profile" : "/login"} className="pill-link justify-start">{session ? "حسابي" : "تسجيل الدخول"}</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="mt-20 bg-[#0c3540] py-12 text-white">
        <div className="container-app grid gap-9 md:grid-cols-3">
          <div><div className="mb-3 flex items-center gap-2 text-2xl font-black"><HeartPulse/> موعد.</div><p className="max-w-sm text-sm leading-8 text-teal-50/70">تجربة حجز طبي بسيطة تساعدك تختار موعدك وتتابع زياراتك بسهولة.</p></div>
          <div><p className="mb-4 font-bold">روابط مهمة</p><div className="grid grid-cols-2 gap-2 text-sm text-teal-50/75"><Link href="/book">احجز موعد</Link><Link href="/my-appointments">مواعيدي</Link><Link href="/about">عن المنصة</Link><Link href="/contact">اتصل بنا</Link><Link href="/reviews">آراء المرضى</Link><Link href="/privacy">الخصوصية</Link></div></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><CalendarCheck2 className="mb-2 text-teal-200"/><p className="font-bold">جاهز لزيارتك الجاية؟</p><p className="mt-1 text-sm text-teal-50/70">اختر اليوم والتوقيت المناسب ليك.</p><Link className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-teal-200" href="/book">ابدأ الحجز <ArrowUpLeft size={16}/></Link></div>
        </div>
        <div className="container-app mt-9 border-t border-white/10 pt-5 text-xs text-teal-50/60">© {new Date().getFullYear()} موعد. جميع الحقوق محفوظة.</div>
      </footer>
    </div>
  );
}
