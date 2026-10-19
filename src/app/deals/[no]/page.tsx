import { DealDetailPage } from "@/components/deal-detail-page";

export const metadata = { title: "ดีล — ERP MAZ" };

/* หน้ารายละเอียดดีลของฝ่ายขาย — กดแถวในหน้าดีลแล้วมาที่นี่ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
export default async function Page({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return <DealDetailPage no={decodeURIComponent(no)} />;
}
