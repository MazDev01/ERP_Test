import { Suspense } from "react";
import { AccBillingPage } from "@/components/acc-billing-page";

export const metadata = { title: "วางบิล — ERP MAZ" };

/* useSearchParams (?find=) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
export default function Page() {
  return (
    <Suspense>
      <AccBillingPage />
    </Suspense>
  );
}
