import { Suspense } from "react";
import { QuotationNewPage } from "@/components/quotation-new-page";

export const metadata = { title: "สร้างใบเสนอราคา — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QuotationNewPage />
    </Suspense>
  );
}
