import { Suspense } from "react";
import { DealsPage } from "@/components/deals-page";

export const metadata = { title: "ดีล — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DealsPage />
    </Suspense>
  );
}
