import type { Metadata } from "next";
import { ClientReviewPage } from "@/components/client-review-page";

/*
 * หน้าลูกค้าตรวจงานจากลิงก์ที่ PM ส่ง — ไม่ต้องล็อกอิน และไม่มีเมนูของระบบ (app-shell ข้าม /review/ ทั้งหมด)
 * Next รุ่นนี้ส่ง params มาเป็น Promise ต้อง await ก่อนใช้
 * TODO เฟส 2: ตรวจ token ที่เซิร์ฟเวอร์ตรงนี้ (ลายเซ็น + วันหมดอายุ) แล้วส่งข้อมูลรอบลงไปแทน localStorage
 */
export const metadata: Metadata = {
  title: "ตรวจงาน — MAZ",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClientReviewPage token={decodeURIComponent(token)} />;
}
