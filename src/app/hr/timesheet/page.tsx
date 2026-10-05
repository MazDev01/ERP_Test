import { Suspense } from "react";
import { HrTimesheetPage } from "@/components/hr-timesheet-page";

export const metadata = { title: "สรุปเวลาทำงาน — ERP MAZ" };

export default function Page() {
  /* อ่านเดือนจาก ?m= (useSearchParams) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
  return (
    <Suspense>
      <HrTimesheetPage />
    </Suspense>
  );
}
