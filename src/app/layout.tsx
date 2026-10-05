import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { PwaBoot } from "@/components/pwa-boot";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  /* 800 ใช้กับตัวเลขใหญ่และหัวข้อเด่น (font-extrabold ~25 ที่) — ไม่โหลดไว้ เบราว์เซอร์จะทำตัวหนาปลอมจาก 700 */
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "ERP MAZ",
  description: "ระบบ ERP งานขายและงานบุคคลของ MAZ",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ERP MAZ" },
};

export const viewport: Viewport = {
  themeColor: "#db0000",
  initialScale: 1,
  width: "device-width",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${notoThai.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <PwaBoot />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
