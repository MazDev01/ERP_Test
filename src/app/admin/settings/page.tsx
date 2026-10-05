import { Suspense } from "react";
import { AdminSettingsPage } from "@/components/admin-settings-page";

export const metadata = { title: "ตั้งค่าระบบ — ERP MAZ" };

export default function Page() {
  /* อ่านหัวข้อจาก ?s= (useSearchParams) ต้องมี Suspense คร่อม ไม่งั้นทั้งหน้าถูกบังคับเป็น dynamic */
  return (
    <Suspense>
      <AdminSettingsPage />
    </Suspense>
  );
}
