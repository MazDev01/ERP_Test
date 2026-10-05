import { Suspense } from "react";
import { PresalesNewPage } from "@/components/presales-form";

export const metadata = { title: "ส่งคำขอก่อนการขาย — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PresalesNewPage />
    </Suspense>
  );
}
