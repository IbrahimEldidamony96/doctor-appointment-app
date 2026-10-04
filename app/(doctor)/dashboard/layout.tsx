import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

const navItems = [
  { href: "/dashboard", label: "نظرة عامة" },
  { href: "/dashboard/appointments", label: "المواعيد" },
  { href: "/dashboard/availability", label: "أوقات العمل" },
  { href: "/dashboard/reviews", label: "التقييمات" },
  { href: "/dashboard/settings", label: "الإعدادات" },
  { href: "/dashboard/stats", label: "الإحصاءات" },
];

export default function DoctorDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <nav className="flex gap-4 overflow-x-auto text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap hover:underline"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
