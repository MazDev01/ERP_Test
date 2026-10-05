import { AccInvoiceView } from "@/components/acc-doc";

export const metadata = { title: "ใบแจ้งหนี้ — ERP MAZ" };

/* ต้นแบบ invoice-view.html — อยู่ใต้เมนูวางบิล สิทธิ์เข้าหน้าตามเมนูนั้น (canVisit) */
export default async function Page({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return <AccInvoiceView no={decodeURIComponent(no)} />;
}
