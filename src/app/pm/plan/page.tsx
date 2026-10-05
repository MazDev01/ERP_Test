import { Suspense } from "react";
import { PmPlanPage } from "@/components/pm-plan-page";

export const metadata = { title: "จัดคิวงาน — ERP MAZ" };

/* useSearchParams (?pj=) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
export default function Page() {
  return (
    <Suspense>
      <PmPlanPage />
    </Suspense>
  );
}
