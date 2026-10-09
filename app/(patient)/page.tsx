import Link from "next/link";
import { ArrowUpLeft, CalendarDays, CheckCircle2, ChevronLeft, ClipboardCheck, Clock3, HeartHandshake, HeartPulse, MessageCircleHeart, ShieldCheck, Smartphone, Sparkles, Stethoscope, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  { icon: Smartphone, number: "01", title: "سجّل برقمك", desc: "ادخل رقم واتساب واستقبل كود التحقق لحماية حسابك." },
  { icon: CalendarDays, number: "02", title: "اختر موعدك", desc: "شوف المواعيد المتاحة واختار اليوم والساعة المناسبة." },
  { icon: ClipboardCheck, number: "03", title: "تابع حجزك", desc: "راجع تفاصيل حجزك أو ألغِ الموعد حسب سياسة العيادة." },
];

export default function Home() {
  return <main>
    <section className="relative overflow-hidden bg-[#ecf8f5]">
      <div className="absolute -left-28 top-12 size-96 rounded-full bg-teal-200/30 blur-3xl" />
      <div className="container-app relative grid items-center gap-12 py-18 lg:grid-cols-[1fr_.9fr] lg:py-28">
        <div className="max-w-2xl">
          <div className="eyebrow"><Sparkles size={15}/> رعايتك تبدأ بخطوة بسيطة</div>
          <h1 className="mt-7 text-5xl font-black leading-[1.35] tracking-tight text-[#123a45] sm:text-6xl">احجز موعدك الطبي <span className="text-teal-700">بكل راحة وثقة.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-9 text-[#637987] sm:text-lg">من غير انتظار ولا مكالمات كتير. اختار الوقت المناسب ليك، احجز في خطوات بسيطة، وتابع كل مواعيدك من مكان واحد.</p>
          <div className="mt-9 flex flex-wrap gap-3"><Link href="/book"><Button size="lg">احجز موعدك الآن <ArrowUpLeft /></Button></Link><Link href="/about"><Button size="lg" variant="outline">اعرف أكتر <ChevronLeft/></Button></Link></div>
          <div className="mt-10 flex flex-wrap gap-5 text-sm font-bold text-[#51737a]"><span className="inline-flex items-center gap-2"><ShieldCheck size={19} className="text-teal-700"/> خصوصية وأمان</span><span className="inline-flex items-center gap-2"><CheckCircle2 size={19} className="text-teal-700"/> حجز سهل وسريع</span></div>
        </div>
        <div className="relative mx-auto w-full max-w-[510px]">
          <div className="relative overflow-hidden rounded-[44px] bg-[#0f4850] p-8 shadow-[0_30px_80px_-34px_rgba(7,73,77,.55)] sm:p-12">
            <div className="absolute -left-24 -top-28 size-80 rounded-full border-[55px] border-white/5" />
            <div className="absolute -right-20 bottom-0 size-64 rounded-full bg-teal-500/25 blur-2xl"/>
            <div className="relative flex items-center justify-between text-sm text-teal-50/80"><span className="inline-flex items-center gap-2"><Stethoscope size={19} /> عيادتك أقرب ليك</span><span className="rounded-full bg-white/10 px-3 py-1">موعد</span></div>
            <div className="relative mt-10 rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-400">حجز موعد جديد</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">اختار الوقت المناسب</h2></div><div className="grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-700"><CalendarDays size={25}/></div></div>
              <div className="mt-7 grid grid-cols-3 gap-3" aria-hidden="true"><div className="rounded-xl bg-teal-700 py-4 text-center text-white"><b className="block text-lg">السبت</b><span className="text-xs">موعد متاح</span></div><div className="rounded-xl bg-slate-50 py-4 text-center text-slate-600"><b className="block text-lg">الأحد</b><span className="text-xs">اختر اليوم</span></div><div className="rounded-xl bg-slate-50 py-4 text-center text-slate-600"><b className="block text-lg">الإثنين</b><span className="text-xs">اختر اليوم</span></div></div>
              <div className="mt-4 flex gap-2" aria-hidden="true"><span className="flex-1 rounded-lg border border-teal-300 bg-teal-50 px-2 py-2 text-center text-sm font-bold text-teal-700">10:00</span><span className="flex-1 rounded-lg border px-2 py-2 text-center text-sm text-slate-500">11:00</span><span className="flex-1 rounded-lg border px-2 py-2 text-center text-sm text-slate-500">12:00</span></div>
              <p className="mt-4 text-center text-xs text-muted-foreground">* عرض توضيحي — المواعيد الفعلية تظهر بعد تسجيل الدخول</p>
              <Link href="/book" className="mt-5 block rounded-xl bg-teal-700 py-3 text-center text-sm font-bold text-white hover:bg-teal-800">اختار موعدك <ArrowUpLeft className="inline size-4"/></Link>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-5 flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-xl sm:-right-8"><div className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2/></div><div><b className="block text-sm">تأكيد ومتابعة</b><span className="text-xs text-slate-400">كل تفاصيل حجزك في مكان واحد</span></div></div>
        </div>
      </div>
    </section>
    <section className="container-app py-22" id="how-it-works">
      <div className="mx-auto max-w-2xl text-center"><span className="eyebrow">خطوات بسيطة</span><h2 className="mt-5 page-title">موعدك في 3 خطوات</h2><p className="page-desc mx-auto">صممنا تجربة الحجز علشان توفر وقتك وتسهّل متابعة مواعيدك.</p></div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">{steps.map(({ icon: Icon, number, title, desc }) => <div className="surface group p-8 transition-transform hover:-translate-y-1" key={title}><div className="flex justify-between"><span className="grid size-14 place-items-center rounded-2xl bg-teal-50 text-teal-700 group-hover:bg-teal-700 group-hover:text-white"><Icon size={25}/></span><span className="text-3xl font-black text-slate-100">{number}</span></div><h3 className="mt-6 text-xl font-extrabold">{title}</h3><p className="mt-3 text-sm leading-8 text-muted-foreground">{desc}</p></div>)}</div>
    </section>
    <section className="bg-white py-20"><div className="container-app grid items-center gap-10 md:grid-cols-2"><div className="relative rounded-[36px] bg-[#daf2ed] p-12 text-teal-800"><div className="soft-pattern absolute inset-4 rounded-3xl opacity-40"/><HeartHandshake className="relative mx-auto size-48 stroke-[1.2]"/><div className="relative mx-auto mt-4 max-w-xs rounded-2xl bg-white p-5 text-center shadow-lg"><HeartPulse className="mx-auto mb-2 text-teal-600"/><p className="font-extrabold">صحتك تستحق اهتمام</p><p className="text-sm text-muted-foreground">نظام حجز واضح ومريح</p></div></div><div><span className="eyebrow">ليه موعد؟</span><h2 className="mt-5 page-title">كل اللي تحتاجه لمواعيدك، في مكان واحد</h2><p className="page-desc">واجهة عربية سهلة الاستخدام وتفاصيل واضحة لكل زيارة.</p><div className="mt-7 space-y-5">{[{ icon: Clock3, title: "وفر وقتك", text: "تصفح الأوقات المتاحة بدون اتصالات متكررة." }, { icon: UserRoundCheck, title: "حسابك ومواعيدك", text: "تابع حجوزاتك السابقة والقادمة بنفس رقم الموبايل." }, { icon: MessageCircleHeart, title: "شارك رأيك", text: "قيّم الزيارة بعد اكتمال الموعد وساعد في تحسين التجربة." }].map(({icon:Icon,title,text}) => <div className="flex items-start gap-4" key={title}><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon size={21}/></div><div><h3 className="font-extrabold">{title}</h3><p className="text-sm text-muted-foreground">{text}</p></div></div>)}</div></div></div></section>
    <section className="container-app pt-22"><div className="relative overflow-hidden rounded-[36px] bg-[#0d4650] px-8 py-12 text-center text-white sm:px-14 sm:py-16"><div className="absolute -right-20 -top-20 size-60 rounded-full bg-teal-500/20 blur-2xl"/><div className="relative"><h2 className="text-3xl font-black sm:text-4xl">خطوتك الأولى لصحة أفضل تبدأ هنا</h2><p className="mx-auto mt-4 max-w-lg text-sm leading-8 text-white/75">سجّل رقمك، اختار ميعادك، وسيب علينا تنظيم التفاصيل.</p><Link href="/book" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 font-extrabold text-teal-800 hover:bg-teal-50">احجز موعدك <ArrowUpLeft size={19}/></Link></div></div></section>
  </main>;
}
