import { QuotationDocPage } from "@/components/quotation-doc-page";

export const metadata = { title: "เอกสารใบเสนอราคา — ERP MAZ" };

/* เอกสารใบเสนอราคาที่เปิดจากเมนูบัญชี — ลิงก์ทุกตัวอยู่ในหน้าของบัญชีเอง (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ no: string }>;
  searchParams: Promise<{ rev?: string; pdf?: string }>;
}) {
  const { no } = await params;
  const { rev, pdf } = await searchParams;
  return <QuotationDocPage no={decodeURIComponent(no)} rev={rev ? Number(rev) : undefined} pdf={pdf === "1"} acc />;
}
