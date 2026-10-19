import { CheckinScreen } from "@/components/checkin-screen";
import { PageTitle } from "@/components/breadcrumb";

export const metadata = { title: "เวลาทำงาน — ERP MAZ" };

export default function Page() {
  return (
    <>
      {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
      <PageTitle />
      <div className="mx-auto max-w-[920px]">
        <CheckinScreen embedded />
      </div>
    </>
  );
}
