import { PmSchedulePage } from "@/components/pm-schedule-page";

export const metadata = { title: "ตารางงาน — ERP MAZ" };

/* ตารางงานของฝ่ายขาย — รูปแบบเดียวกับของ PM ผู้เข้าร่วมเป็นผู้สนใจ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
export default function Page() {
  return <PmSchedulePage sales />;
}
