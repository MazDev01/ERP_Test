import { HomePage } from "@/components/ceo-home-page";

export const metadata = { title: "หน้าหลัก — ERP MAZ" };

/* บทบาทที่มีหน้าหลักของตัวเอง (ทีมงาน · CEO) เปิด /home แล้วถูกพาไปหน้านั้นแทน */
export default function Page() {
  return <HomePage />;
}
