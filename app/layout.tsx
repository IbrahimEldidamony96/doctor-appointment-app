import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "موعد | احجز زيارتك بسهولة", template: "%s | موعد" },
  description: "منصة سهلة وآمنة لحجز المواعيد الطبية ومتابعة زياراتك ودفع رسوم الكشف.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="ar" dir="rtl">
        <body className="min-h-screen antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
