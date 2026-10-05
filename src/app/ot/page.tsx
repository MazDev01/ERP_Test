import { Suspense } from "react";
import { OtPage } from "@/components/ot-page";

export const metadata = { title: "โอที — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OtPage />
    </Suspense>
  );
}
