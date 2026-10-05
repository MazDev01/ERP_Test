import { Suspense } from "react";
import { PmAdsPage } from "@/components/pm-ads-page";

export const metadata = { title: "โฆษณาและรายงาน — ERP MAZ" };

/* useSearchParams (?pj=) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
export default function Page() {
  return (
    <Suspense>
      <PmAdsPage />
    </Suspense>
  );
}
