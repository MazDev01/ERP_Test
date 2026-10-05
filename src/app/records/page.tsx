import { Suspense } from "react";
import { AttendanceTable } from "@/components/attendance-table";

export const metadata = { title: "บันทึกเวลาของฉัน — ERP MAZ" };

/* useSearchParams (?month=) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
export default function Page() {
  return (
    <Suspense>
      <AttendanceTable />
    </Suspense>
  );
}
