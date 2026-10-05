import { Suspense } from "react";
import { LeavePage } from "@/components/leave-page";

export const metadata = { title: "การลา — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeavePage />
    </Suspense>
  );
}
