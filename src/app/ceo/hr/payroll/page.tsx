import { Suspense } from "react";
import { CeoPayrollPage } from "@/components/ceo-payroll-page";

export const metadata = { title: "ยอดเงินเดือน — ERP MAZ" };

/* ยอดเงินเดือนแบบดูอย่างเดียวของ CEO (ผู้ใช้สั่ง 14 ต.ค. 2569) — อ่าน ?m= จึงต้องมี Suspense คร่อม */
export default function Page() {
  return (
    <Suspense>
      <CeoPayrollPage />
    </Suspense>
  );
}
