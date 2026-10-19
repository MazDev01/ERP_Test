import { CeoView } from "@/components/ceo-view";
import { DealDetailPage } from "@/components/deal-detail-page";

export const metadata = { title: "ดีลและใบงาน — ERP MAZ" };

/* หน้ารายละเอียดดีลสำหรับ CEO ดูอย่างเดียว — อยู่ใต้ /ceo/sales จึงเป็นหน้าของ CEO เอง (ผู้ใช้สั่ง 15 ต.ค. 2569) */
export default async function Page({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return (
    <CeoView>
      <DealDetailPage no={decodeURIComponent(no)} ceo />
    </CeoView>
  );
}
