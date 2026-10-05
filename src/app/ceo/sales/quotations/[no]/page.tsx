import { CeoView } from "@/components/ceo-view";
import { QuotationDocPage } from "@/components/quotation-doc-page";

export const metadata = { title: "เอกสารใบเสนอราคา — ERP MAZ" };

/* ต้นแบบ ceo-deals.html — กดเลขใบเสนอราคาในหน้าดีลแล้วเปิดเอกสาร อยู่ใต้ /ceo/sales จึงเป็นหน้าของ CEO เอง */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ no: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  const { no } = await params;
  const { rev } = await searchParams;
  return (
    <CeoView>
      <QuotationDocPage no={decodeURIComponent(no)} rev={rev ? Number(rev) : undefined} ceo />
    </CeoView>
  );
}
