import { DealAccDoc } from "@/components/deal-detail-page";

export const metadata = { title: "ใบเสร็จรับเงิน — ERP MAZ" };

/* ใบเสร็จรับเงินของดีลที่เปิดจากหน้ารายละเอียดดีล — ฝ่ายขายดูอย่างเดียว · ?pdf=1 เปิดหน้าต่างบันทึก PDF (ผู้ใช้สั่ง 15 ต.ค. 2569) */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ no: string; doc: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  const { no, doc } = await params;
  const { pdf } = await searchParams;
  return <DealAccDoc dealNo={decodeURIComponent(no)} doc={decodeURIComponent(doc)} kind="receipt" pdf={pdf === "1"} />;
}
