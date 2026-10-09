import Link from "next/link";
import { ArrowRight, HeartPulse, ShieldCheck, CalendarCheck2, CheckCircle2 } from "lucide-react";

export function AuthShell({ children, title, subtitle, step }: { children: React.ReactNode; title: string; subtitle: string; step: 1 | 2 }) {
  return <main className="container-app grid min-h-[660px] items-center gap-12 py-12 lg:grid-cols-2 lg:py-20">
    <section className="surface mx-auto w-full max-w-[495px] p-7 sm:p-10">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-teal-800"><ArrowRight size={17}/> رجوع للرئيسية</Link>
      <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-teal-50 text-teal-700"><HeartPulse size={27}/></div>
      <div className="mb-4 flex items-center gap-2"><span className="eyebrow">{step === 1 ? "الخطوة 1 من 2" : "الخطوة 2 من 2"}</span></div>
      <h1 className="text-3xl font-black text-[#153b47]">{title}</h1>
      <p className="mt-3 mb-8 text-sm leading-8 text-muted-foreground">{subtitle}</p>
      {children}
      <div className="mt-8 flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700"/> رقمك بيستخدم للتحقق من حسابك وإشعارات المواعيد، ومش بنطلب منك كلمة مرور.</div>
    </section>
    <aside className="relative hidden overflow-hidden rounded-[36px] bg-[#0d4650] px-10 py-14 text-white lg:block">
      <div className="absolute -left-32 -top-16 size-96 rounded-full border-[65px] border-white/5"/>
      <div className="absolute -right-20 bottom-0 size-64 rounded-full bg-teal-400/15 blur-3xl"/>
      <div className="relative"><div className="inline-flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2 text-sm"><HeartPulse/> موعد — رعايتك أسهل</div><h2 className="mt-12 text-4xl font-extrabold leading-[1.5]">كل موعد مهم.<br/><span className="text-[#83e5d5]">ووقتك أغلى.</span></h2><p className="mt-5 max-w-sm text-sm leading-8 text-white/70">حساب واحد يساعدك تحجز زياراتك وتتأكد من تفاصيلها من أي جهاز.</p><div className="mt-12 rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur-sm"><div className="flex items-center gap-4"><div className="grid size-14 place-items-center rounded-2xl bg-white text-teal-700"><CalendarCheck2 size={27}/></div><div><p className="font-bold">خطوات قليلة، راحة أكتر</p><p className="text-sm text-white/65">التحقق ثم اختيار الموعد</p></div></div><div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-5 text-sm text-[#a4f0e3]"><CheckCircle2 size={18}/> تجربة آمنة وسهلة الاستخدام</div></div></div>
    </aside>
  </main>;
}
