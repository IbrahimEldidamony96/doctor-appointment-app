"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Clock3, MessageSquareText, Settings2, ChartColumnIncreasing, ArrowUpLeft, HeartPulse } from "lucide-react";
const links = [
  { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/dashboard/appointments", label: "المواعيد", icon: CalendarDays },
  { href: "/dashboard/availability", label: "أوقات العمل", icon: Clock3 },
  { href: "/dashboard/reviews", label: "التقييمات", icon: MessageSquareText },
  { href: "/dashboard/stats", label: "الإحصاءات", icon: ChartColumnIncreasing },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings2 },
];
export function DashboardNav() {
  const pathname = usePathname();
  return <nav className="flex gap-2 overflow-x-auto py-2 lg:flex-col lg:overflow-visible" aria-label="قائمة لوحة التحكم">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${pathname === href ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-teal-50 hover:text-teal-800"}`}><Icon size={19}/>{label}</Link>)}</nav>;
}
export function DashboardLogo() { return <Link href="/" className="flex items-center gap-2 text-2xl font-black text-[#103b47]"><span className="grid size-10 place-items-center rounded-xl bg-teal-700 text-white"><HeartPulse size={21}/></span> موعد<span className="text-teal-600">.</span></Link>; }
export function DashboardViewSite() { return <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-100">عرض الموقع <ArrowUpLeft size={15}/></Link>; }
