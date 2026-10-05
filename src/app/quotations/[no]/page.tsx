import { QuotationDocPage } from "@/components/quotation-doc-page";

export const metadata = { title: "เอกสารใบเสนอราคา — ERP MAZ" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ no: string }>;
  searchParams: Promise<{ rev?: string; pdf?: string }>;
}) {
  const { no } = await params;
  const { rev, pdf } = await searchParams;
  /* ?rev=n = เปิดฉบับเก่าจากประวัติการแก้ไข */
  return <QuotationDocPage no={decodeURIComponent(no)} rev={rev ? Number(rev) : undefined} pdf={pdf === "1"} />;
}
