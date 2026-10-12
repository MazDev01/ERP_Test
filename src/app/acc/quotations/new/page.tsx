import { Suspense } from "react";
import { QuotationNewPage } from "@/components/quotation-new-page";

export const metadata = { title: "สร้างใบเสนอราคา — ERP MAZ" };

/* หน้าสร้างเดียวกับฝ่ายขาย อยู่ใต้เมนูใบเสนอราคาของบัญชี สิทธิ์เข้าหน้าตามเมนูนั้น (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <QuotationNewPage base="/acc/quotations" />
    </Suspense>
  );
}
