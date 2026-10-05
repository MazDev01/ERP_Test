import { Suspense } from "react";
import { QuotationsPage } from "@/components/quotations-page";

export const metadata = { title: "ใบเสนอราคา — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QuotationsPage />
    </Suspense>
  );
}
