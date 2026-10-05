import { RoleHomePage } from "@/components/ceo-home-page";

export const metadata = { title: "หน้าหลัก — ERP MAZ" };

/* 22 ก.ย. 2569 ทีมงานใช้หน้าหลักแบบเดียวกับ CEO ตามที่ผู้ใช้สั่ง (my-home-page.tsx เดิมไม่ได้ใช้แล้ว) */
export default function Page() {
  return <RoleHomePage />;
}
