import { Suspense } from "react";
import { AccWhtPage } from "@/components/acc-wht-page";

export const metadata = { title: "ยื่นภาษี — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AccWhtPage />
    </Suspense>
  );
}
