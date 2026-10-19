import { CeoView } from "@/components/ceo-view";
import { ContractPage } from "@/components/contract-page";

export const metadata = { title: "ใบสัญญา — ERP MAZ" };

/* ใบสัญญาของดีลสำหรับ CEO ดูอย่างเดียว — อยู่ใต้ /ceo/sales จึงเป็นหน้าของ CEO เอง (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ no: string }>;
  searchParams: Promise<{ v?: string; pdf?: string }>;
}) {
  const { no } = await params;
  const { v, pdf } = await searchParams;
  return (
    <CeoView>
      <ContractPage dealNo={decodeURIComponent(no)} v={v ? Number(v) : undefined} pdf={pdf === "1"} ceo />
    </CeoView>
  );
}
