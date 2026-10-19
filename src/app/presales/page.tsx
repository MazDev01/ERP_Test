import { Suspense } from "react";
import { PresalesPage } from "@/components/presales-page";

export const metadata = { title: "ขอทำข้อเสนอ — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PresalesPage />
    </Suspense>
  );
}
