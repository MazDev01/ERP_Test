import { Suspense } from "react";
import { ProfilePage } from "@/components/profile-page";

export const metadata = { title: "โปรไฟล์ของฉัน — ERP MAZ" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProfilePage />
    </Suspense>
  );
}
