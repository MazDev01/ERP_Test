import { Suspense } from "react";
import { HrCyclesPage } from "@/components/hr-cycles-page";

export const metadata = { title: "ประวัติรอบจ่าย — ERP MAZ" };

export default function Page() {
  /* อ่านกลุ่มจาก ?g= (useSearchParams) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
  return (
    <Suspense>
      <HrCyclesPage />
    </Suspense>
  );
}
