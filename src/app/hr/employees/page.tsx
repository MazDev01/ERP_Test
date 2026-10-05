import { Suspense } from "react";
import { HrEmployeesPage } from "@/components/hr-employees-page";

export const metadata = { title: "ข้อมูลพนักงาน — ERP MAZ" };

/* useSearchParams (?find=) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
export default function Page() {
  return (
    <Suspense>
      <HrEmployeesPage />
    </Suspense>
  );
}
