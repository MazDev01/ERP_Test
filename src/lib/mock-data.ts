/*
 * ข้อมูลพนักงานที่ล็อกอินอยู่ — ค่าตั้งต้นของโปรไฟล์ใน profile-data.ts
 *
 * มีคนละชุดต่อหนึ่งบทบาท เพราะผู้ใช้เลือกบทบาทตอนเข้าสู่ระบบ (ดู role.ts)
 * ตำแหน่งกับฝ่ายต้องตรงกับบทบาทเสมอ ไม่งั้นจะขัดกับเมนูและหน้าอื่นทั้งระบบ
 *
 * ยังไม่มี backend — เมื่อต่อ API แล้วให้แทนที่ไฟล์นี้ด้วยการ fetch จริง
 */

import type { Role } from "./role";

export type EmployeeSeed = {
  name: string;
  employeeId: string;
  position: string;
  department: string;
  supervisor: string;
  email: string;
  phone: string;
  startDate: string;
  employmentType: string;
  workSchedule: string;
};

export const USERS: Record<Role, EmployeeSeed> = {
  /* พนักงานขาย — มีไปป์ไลน์ผู้สนใจ ออกใบเสนอราคา และเบิกค่าคอมมิชชั่น 5% ของมูลค่าดีล */
  sales: {
    name: "ชนัญชิดา ใจดี",
    employeeId: "E18",
    position: "Sales",
    department: "Business Development",
    supervisor: "ประเสริฐ มั่นคงดี (General Manager)",
    email: "chananchida.j@example.com",
    phone: "089-556-1120",
    startDate: "2023-02-01",
    employmentType: "พนักงานประจำ",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* ทีมก่อนการขาย (SA) — รับคำขอก่อนการขายแล้วส่งข้อเสนอกลับ (ต้นแบบ presales-work.html)
     รหัสตรงกับ E01 ในทะเบียนฝ่ายบุคคล · ชื่อในคิวงานใช้ "ปิยะวัฒน์ (SA)" ตามต้นแบบ */
  ps: {
    name: "ปิยะวัฒน์ แก้วใส",
    employeeId: "E01",
    position: "System Analysis",
    department: "Developer",
    supervisor: "ประเสริฐ มั่นคงดี (General Manager)",
    email: "piyawat.k@example.com",
    phone: "081-330-4471",
    startDate: "2022-06-01",
    employmentType: "พนักงานประจำ",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* ผู้จัดการโครงการ — รับใบงานที่เกิดจากดีลที่ปิดได้ แล้วมอบหมายให้ทีมทำต่อ */
  pm: {
    name: "ชนิกานต์ วัฒนกุล",
    employeeId: "E10",
    position: "Project Manager",
    department: "Marketing",
    supervisor: "ประเสริฐ มั่นคงดี (General Manager)",
    email: "chanikan.w@example.com",
    phone: "081-556-9902",
    startDate: "2021-03-01",
    employmentType: "พนักงานประจำ",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* พนักงานบัญชี — วางบิลจากดีลที่ปิดการขาย ติดตามหนี้ ออกใบเสร็จ และนำส่งภาษี */
  acc: {
    name: "อรอนงค์ พรหมมา",
    employeeId: "E12",
    position: "บัญชีและบุคคล",
    department: "Back Office",
    supervisor: "ประเสริฐ มั่นคงดี (General Manager)",
    email: "ornanong.p@example.com",
    phone: "088-224-3390",
    startDate: "2020-09-01",
    employmentType: "พนักงานประจำ",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* ฝ่ายบุคคล — ดูแลข้อมูลพนักงาน ปิดรอบเวลาทำงาน คำนวณเงินเดือน และออกสลิป
     รหัสพนักงานตรงกับ E12 ใน hr-data.ts เพราะหน้าฝ่ายบุคคลอ้างถึงตัวเองด้วยรหัสนั้น */
  hr: {
    name: "อรอนงค์ พรหมมา",
    employeeId: "E12",
    position: "บัญชีและบุคคล",
    department: "Back Office",
    supervisor: "ประเสริฐ มั่นคงดี (General Manager)",
    email: "ornanong.p@example.com",
    phone: "088-224-3390",
    startDate: "2020-09-01",
    employmentType: "พนักงานประจำ",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* ทีมงาน — คนที่ลงมือทำงานย่อยที่ PM มอบหมาย แล้วส่งผลงานกลับให้ตรวจ
     ต้องเป็นคนเดียวกับที่อยู่ใน PM_TEAM ไม่งั้นจะไม่มีงานของตัวเองให้เห็น (ดู pm-data.ts) */
  staff: {
    name: "กมลชนก พูนสุข",
    employeeId: "E05",
    position: "Website",
    department: "Website",
    supervisor: "ชนิกานต์ วัฒนกุล (ผู้จัดการโครงการ)",
    email: "kamonchanok.p@mazdsi.com",
    phone: "091-338-7742",
    startDate: "2024-03-01",
    employmentType: "พนักงานประจำ",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* GM — อนุมัติใบลาของพนักงานทั่วไป (ERD HR-BR-14) รหัสตรงกับ E11 ในทะเบียนฝ่ายบุคคล */
  gm: {
    name: "ประเสริฐ มั่นคงดี",
    employeeId: "E11",
    position: "General Manager",
    department: "Marketing",
    supervisor: "Chief Executive Officer (ผู้บริหาร)",
    email: "prasert.m@mazdsi.com",
    phone: "081-889-2211",
    startDate: "2019-05-01",
    employmentType: "พนักงานประจำ",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* ผู้บริหาร — อนุมัติคำขอที่ขึ้นถึงผู้บริหารและยอดเงินเดือน ชื่อบัญชีตามต้นแบบ ceo-*.html
     ไม่ได้อยู่ในทะเบียนพนักงานของฝ่ายบุคคล จึงไม่มีสลิปในระบบ */
  ceo: {
    name: "CEO",
    employeeId: "EMP-00001",
    position: "ผู้บริหาร",
    department: "ผู้บริหาร",
    supervisor: "—",
    email: "ceo@mazdsi.com",
    phone: "081-000-0001",
    startDate: "2019-01-02",
    employmentType: "ผู้บริหาร",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* ผู้ดูแลระบบ — ตั้งค่าที่มีผลทั้งบริษัท เช่นพื้นที่ที่ตอกบัตรเข้างานได้
     ⚠️ 25 ก.ย. 2569 เจ้าของสั่งให้ "แยกออกไปเลย" — ไม่ควบกับฝ่ายบุคคล และไม่ควบกับผู้บริหาร
        (24 ก.ย. เคยผูกไว้กับอรอนงค์ E12 และให้ผู้บริหารถือเป็นตัวสำรอง ตอนนี้ยกเลิกทั้งสองอย่าง)
     เป็นบัญชีของตัวเอง ไม่ใช่พนักงานในทะเบียน จึงไม่มีรหัสพนักงานและไม่มีสลิป
     เรียกตามหน้าที่ ไม่ใช่ชื่อคนสมมติ — เจ้าของเคยสั่งเลิกใช้คนสมมติ (เดิม "ธนากร ศรีวงศ์")
     บทบาทนี้ไม่มีเมนูของฉัน (NO_REQUESTS) จึงไม่มีใบลา/โอที/ใบเบิกของตัวเอง */
  /* นักศึกษาฝึกงาน (ผู้ใช้สั่ง 2 ต.ค. 2569) — รหัสตรงกับ E14 ในทะเบียนฝ่ายบุคคล ใช้ได้แค่ลงเวลา */
  intern: {
    name: "ณัฐริกา ใจอารีย์",
    employeeId: "E14",
    position: "Graphic",
    department: "Marketing",
    supervisor: "ประเสริฐ มั่นคงดี (ผู้จัดการทั่วไป)",
    email: "nattarika.j@example.com",
    phone: "092-556-1140",
    startDate: "2026-06-01",
    employmentType: "ฝึกงาน",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
  /* แม่บ้าน (ผู้ใช้สั่ง 2 ต.ค. 2569) — รหัสตรงกับ E15 ในทะเบียนฝ่ายบุคคล */
  maid: {
    name: "บุญเรือน สายทอง",
    employeeId: "E15",
    position: "แม่บ้าน",
    department: "Back Office",
    supervisor: "อรอนงค์ พรหมมา (บัญชีและบุคคล)",
    email: "—",
    phone: "080-114-2290",
    startDate: "2019-08-01",
    employmentType: "พนักงานประจำ",
    workSchedule: "จันทร์ – ศุกร์ 09:00 – 18:00 น.",
  },
};

/**
 * ชื่อผู้ดูแลระบบสมมติที่เลิกใช้แล้ว — เก็บไว้เพื่อย้อนข้อมูลเก่าในเครื่องผู้ใช้เท่านั้น
 * ประวัติการตั้งค่าและโปรไฟล์ที่เคยบันทึกชื่อนี้ไว้ ต้องเปลี่ยนเป็นคนจริง (ดู admin-log.ts · profile-data.ts)
 * ลบได้เมื่อต่อ backend แล้ว เพราะข้อมูลจะไม่ได้มาจาก localStorage อีก
 */
export const RETIRED_ADMIN_NAME = "ธนากร ศรีวงศ์";

/** ค่าตั้งต้นของฝั่งขาย — ข้อมูลจำลองสายงานขายทั้งชุดอ้างชื่อคนนี้ */
export const CURRENT_USER = USERS.sales;
