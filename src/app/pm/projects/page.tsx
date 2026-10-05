import { Suspense } from "react";
import { PmProjectEntry } from "@/components/pm-project-entry";

export const metadata = { title: "โปรเจค — ERP MAZ" };

/* useSearchParams (?pj=) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
export default function Page() {
  return (
    <Suspense>
      <PmProjectEntry />
    </Suspense>
  );
}
