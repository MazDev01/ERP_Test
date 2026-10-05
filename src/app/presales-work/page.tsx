import { Suspense } from "react";
import { PresalesWorkPage } from "@/components/presales-work-page";

export const metadata = { title: "งานก่อนการขาย — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PresalesWorkPage />
    </Suspense>
  );
}
