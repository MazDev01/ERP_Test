import { GmPerformancePage } from "@/components/gm-performance-page";

export const metadata = { title: "ประสิทธิภาพพนักงาน — ERP MAZ" };

/* ช่วงเวลาอยู่ใน ?r= (m เดือนนี้ · q ไตรมาส · y ปีนี้) — ส่งค่าตั้งต้นให้หน้า (ผู้ใช้สั่ง 26 ต.ค. 2569) */
export default async function Page({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  return <GmPerformancePage initialRange={r} />;
}
