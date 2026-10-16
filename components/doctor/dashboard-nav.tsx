"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Clock3, MessageSquareText, Settings2, ChartColumnIncreasing, ArrowUpLeft, HeartPulse, Users } from "lucide-react";
import type { ClinicRole, ClinicPermission } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/permissions";

const links: { href: string; label: string; icon: typeof LayoutDashboard; permission: ClinicPermission }[] = [
  { href: "/dashboard", label: "نظرة عامة", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/dashboard/appointments", label: "المواعيد", icon: CalendarDays, permission: "appointments:view" },
  { href: "/dashboard/availability", label: "أوقات العمل", icon: Clock3, permission: "schedule:manage" },
  { href: "/dashboard/reviews", label: "التقييمات", icon: MessageSquareText, permission: "reviews:manage" },
  { href: "/dashboard/stats", label: "الإحصاءات", icon: ChartColumnIncreasing, permission: "stats:view" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: Settings2, permission: "settings:manage" },
  { href: "/dashboard/staff", label: "السكرتارية", icon: Users, permission: "staff:manage" },
];
export function DashboardNav({ role }: { role: ClinicRole }) {
  const pathname = usePathname();
  return <nav className="flex gap-2 overflow-x-auto py-2 lg:flex-col lg:overflow-visible" aria-label="قائمة لوحة التحكم">
    {links.filter(link => hasPermission(role, link.permission)).map(({ href, label, icon: Icon }) =>
      <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
        className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${pathname === href ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-teal-50 hover:text-teal-800"}`}>
        <Icon size={19}/>{label}
      </Link>)}
  </nav>;
}
export function DashboardLogo() { return <Link href="/" className="flex items-center gap-2 text-2xl font-black text-[#103b47]"><span className="grid size-10 place-items-center rounded-xl bg-teal-700 text-white"><HeartPulse size={21}/></span> موعد<span className="text-teal-600">.</span></Link>; }
export function DashboardViewSite() { return <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700 hover:bg-teal-100">عرض الموقع <ArrowUpLeft size={15}/></Link>; }
