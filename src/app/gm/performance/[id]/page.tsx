import { GmPerformanceDetail } from "@/components/gm-performance-detail";

export const metadata = { title: "ประสิทธิภาพรายคน — ERP MAZ" };

/* หน้ารายคนเต็มหน้า — เข้าจาก "ดูรายละเอียดเพิ่มเติม" ช่วงเวลาติดมากับ ?r= (ผู้ใช้สั่ง 26 ต.ค. 2569) */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { id } = await params;
  const { r } = await searchParams;
  return <GmPerformanceDetail id={decodeURIComponent(id)} initialRange={r} />;
}
