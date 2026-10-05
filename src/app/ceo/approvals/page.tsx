import { Suspense } from "react";
import { CeoApprovalsPage } from "@/components/ceo-approvals-page";

export const metadata = { title: "คำขออนุมัติ — ERP MAZ" };

export default function Page() {
  /* ใช้ ?req= จากแดชบอร์ดและแจ้งเตือน LINE จึงต้องหุ้ม Suspense */
  return (
    <Suspense fallback={null}>
      <CeoApprovalsPage />
    </Suspense>
  );
}
