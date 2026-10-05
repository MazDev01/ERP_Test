import { Suspense } from "react";
import { PresalesPage } from "@/components/presales-page";

export const metadata = { title: "คำขอก่อนการขาย — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PresalesPage />
    </Suspense>
  );
}
