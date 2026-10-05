import { Suspense } from "react";
import { PmInboxPage } from "@/components/pm-inbox-page";

export const metadata = { title: "งานเข้าใหม่ — ERP MAZ" };

/* useSearchParams (?find=) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
export default function Page() {
  return (
    <Suspense>
      <PmInboxPage />
    </Suspense>
  );
}
