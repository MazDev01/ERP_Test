import { Suspense } from "react";
import { HrPayslipPage } from "@/components/hr-payslip-page";

export const metadata = { title: "สลิปเงินเดือน — ERP MAZ" };

export default function Page() {
  /* อ่านเดือนจาก ?m= (useSearchParams) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
  return (
    <Suspense>
      <HrPayslipPage />
    </Suspense>
  );
}
