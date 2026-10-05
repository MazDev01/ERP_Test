import { Suspense } from "react";
import { HrPayrollPage } from "@/components/hr-payroll-page";

export const metadata = { title: "คำนวณเงินเดือน — ERP MAZ" };

export default function Page() {
  /* อ่านเดือนจาก ?m= (useSearchParams) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
  return (
    <Suspense>
      <HrPayrollPage />
    </Suspense>
  );
}
