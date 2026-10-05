import { AccReceiptView } from "@/components/acc-doc";

export const metadata = { title: "ใบเสร็จรับเงิน — ERP MAZ" };

/* ต้นแบบ receipt-view.html — อยู่ใต้เมนูใบเสร็จ สิทธิ์เข้าหน้าตามเมนูนั้น (canVisit) */
export default async function Page({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return <AccReceiptView no={decodeURIComponent(no)} />;
}
