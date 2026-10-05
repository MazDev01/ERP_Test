import { Suspense } from "react";
import { ApprovalsPage } from "@/components/approvals-page";

export const metadata = { title: "รายการรออนุมัติ — ERP MAZ" };

export default function Page() {
  /* ใช้ ?kind= และ ?find= จากลิงก์ในแจ้งเตือน LINE จึงต้องหุ้ม Suspense */
  return (
    <Suspense fallback={null}>
      <ApprovalsPage />
    </Suspense>
  );
}
