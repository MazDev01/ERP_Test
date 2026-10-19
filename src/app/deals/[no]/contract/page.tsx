import { ContractPage } from "@/components/contract-page";

export const metadata = { title: "ใบสัญญา — ERP MAZ" };

/* ใบสัญญาของดีล — ฝ่ายขายออก/แก้/ดู · ?v=n เปิดฉบับเก่า · ?pdf=1 เปิดหน้าต่างบันทึก PDF (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ no: string }>;
  searchParams: Promise<{ v?: string; pdf?: string }>;
}) {
  const { no } = await params;
  const { v, pdf } = await searchParams;
  return <ContractPage dealNo={decodeURIComponent(no)} v={v ? Number(v) : undefined} pdf={pdf === "1"} />;
}
