import { Suspense } from "react";
import { MyTasksPage } from "@/components/my-tasks-page";

export const metadata = { title: "งานที่ได้รับ — ERP MAZ" };

/* useSearchParams (?stage= ?find= จากกระดิ่ง) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
export default function Page() {
  return (
    <Suspense>
      <MyTasksPage />
    </Suspense>
  );
}
