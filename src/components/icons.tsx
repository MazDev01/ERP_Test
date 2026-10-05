import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PowerIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></Base>
);
export const ClockIcon = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Base>
);
export const CalendarIcon = (p: IconProps) => (
  <Base {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Base>
);
export const SearchIcon = (p: IconProps) => (
  <Base {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></Base>
);
export const LeaveIcon = (p: IconProps) => (
  <Base {...p}><path d="M8 2v4" /><path d="M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="m9 16 2 2 4-4" /></Base>
);
export const UserIcon = (p: IconProps) => (
  <Base {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Base>
);
export const ChartIcon = (p: IconProps) => (
  <Base {...p}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></Base>
);
export const HomeIcon = (p: IconProps) => (
  <Base {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Base>
);
export const UsersIcon = (p: IconProps) => (
  <Base {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Base>
);
export const MenuIcon = (p: IconProps) => (
  <Base {...p}><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></Base>
);
export const CloseIcon = (p: IconProps) => (
  <Base {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Base>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}><path d="m6 9 6 6 6-6" /></Base>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}><path d="m15 18-6-6 6-6" /></Base>
);
export const LoginIcon = (p: IconProps) => (
  <Base {...p}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></Base>
);
export const LogoutIcon = (p: IconProps) => (
  <Base {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Base>
);
export const HelpIcon = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></Base>
);
export const CheckIcon = (p: IconProps) => (
  <Base {...p}><polyline points="20 6 9 17 4 12" /></Base>
);
/** กล่องรออนุมัติ — เอกสารที่มีเครื่องหมายถูก */
export const ApproveIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
    <polyline points="14 3 14 9 20 9" />
    <polyline points="9 15 11 17 15 13" />
  </Base>
);
/** โฆษณาและรายงาน — ลำโพงประกาศ สื่อถึงการกระจายสื่อออกไป */
export const AdsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 9.5h3l6-4v13l-6-4h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
    <path d="M6.5 14.5v4" />
    <path d="M17 8.5a5 5 0 0 1 0 7" />
    <path d="M19.8 6a8.5 8.5 0 0 1 0 12" />
  </Base>
);
export const TrashIcon = (p: IconProps) => (
  <Base {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></Base>
);
export const CameraIcon = (p: IconProps) => (
  <Base {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></Base>
);
export const PlusIcon = (p: IconProps) => (
  <Base {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Base>
);
export const UploadIcon = (p: IconProps) => (
  <Base {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Base>
);
/* กล่องติ๊กถูก — งานที่ได้รับและงานรอตรวจ ตามต้นแบบ my-tasks.html */
export const TasksIcon = (p: IconProps) => (
  <Base {...p}><rect x="3.5" y="4.5" width="17" height="16" rx="2.4" /><path d="m8 12 2.5 2.5L16 9" /></Base>
);

/* คนสองคนกับลูกศรส่งต่อ — ใช้กับการรับช่วงดูแลผู้สนใจ */
export const HandoverIcon = (p: IconProps) => (
  <Base {...p}><circle cx="7" cy="6.5" r="3" /><path d="M2 20v-1.5A4.5 4.5 0 0 1 6.5 14H7" /><circle cx="17.5" cy="10" r="2.6" /><path d="M13.4 20v-1a4.1 4.1 0 0 1 4.1-4.1h.4" /><path d="M10 8.5h4.5" /><path d="m12.8 6.6 1.9 1.9-1.9 1.9" /></Base>
);

/* ถูกในวงกลม — งานที่ PM ตรวจผ่านแล้ว */
export const CheckCircleIcon = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="m8.2 12.2 2.6 2.6 5-5.2" /></Base>
);

/* กระดาษพับมุม — ใช้กับไฟล์แนบ ตามต้นแบบ presales-new.html */
export const FileIcon = (p: IconProps) => (
  <Base {...p}><path d="M6 3h9l5 5v13H6Z" /><path d="M14 3v6h6" /></Base>
);
export const PinIcon = (p: IconProps) => (
  <Base {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></Base>
);
export const BuzzIcon = (p: IconProps) => (
  <Base {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Base>
);
export const HeartIcon = (p: IconProps) => (
  <Base {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" /></Base>
);
export const RotateIcon = (p: IconProps) => (
  <Base {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></Base>
);

// ─── ไอคอนเมนูตาม mockup ─────────────────────────────────────────
export const LeadsIcon = (p: IconProps) => (
  <Base {...p}><circle cx="9" cy="8" r="3.4" /><path d="M3 20c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6" /><path d="M17 10h5M19.5 7.5v5" /></Base>
);
export const PresalesIcon = (p: IconProps) => (
  <Base {...p}><path d="M9 3h6l1 3h3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3Z" /><path d="M9 13h6M9 16.5h4" /></Base>
);
export const QuotationIcon = (p: IconProps) => (
  <Base {...p}><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v6h6" /></Base>
);
export const DealsIcon = (p: IconProps) => (
  <Base {...p}><path d="M3 6h18l-1.6 9.5a2 2 0 0 1-2 1.7H6.6a2 2 0 0 1-2-1.7Z" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></Base>
);
export const OtIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /><circle cx="12" cy="12" r="3.6" /></Base>
);
export const CommissionIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 3v18" /><path d="M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1.1-4.5 3 2 2.6 4.5 3 4.5 1.1 4.5 3-2 3-4.5 3-4.5-1.1-4.5-3" /></Base>
);
export const BellIcon = (p: IconProps) => (
  <Base {...p}><path d="M18 15v-4a6 6 0 1 0-12 0v4l-1.5 2.5h15Z" /><path d="M10 20h4" /></Base>
);
export const LockIcon = (p: IconProps) => (
  <Base {...p}><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Base>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}><path d="m9 5 7 7-7 7" /></Base>
);
export const ChevronUpIcon = (p: IconProps) => (
  <Base {...p}><path d="m5 15 7-7 7 7" /></Base>
);
export const DownloadIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></Base>
);
export const EyeIcon = (p: IconProps) => (
  <Base {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Base>
);
export const EyeOffIcon = (p: IconProps) => (
  <Base {...p}><path d="M3 3l18 18" /><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.3 3.9" /><path d="M6.3 7.5A16.6 16.6 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Base>
);
export const GridIcon = (p: IconProps) => (
  <Base {...p}><rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.6" /><path d="M17.5 14v7M14 17.5h7" /></Base>
);
export const TrendUpIcon = (p: IconProps) => (
  <Base {...p}><path d="m3 17 6-6 4 4 8-8" /><path d="M17 7h4v4" /></Base>
);
export const TrendDownIcon = (p: IconProps) => (
  <Base {...p}><path d="m3 7 6 6 4-4 8 8" /><path d="M17 17h4v-4" /></Base>
);

export const PhoneIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 4h4l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1Z" />
  </Base>
);

export const MailIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.4" />
    <path d="m3 7 9 6 9-6" />
  </Base>
);

export const SendIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 13 4 4L19 7" />
  </Base>
);

export const PrintIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 9V3h12v6" />
    <rect x="3" y="9" width="18" height="7" rx="2" />
    <path d="M6 14h12v7H6z" />
  </Base>
);

export const EditIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20v-2.5c0-2.5 3.1-4 7-4" />
    <circle cx="11" cy="8" r="3.4" />
    <path d="m15.5 20 5.5-5.5-2.5-2.5L13 17.5V20Z" />
  </Base>
);

export const BanIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </Base>
);

export const PencilIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L8.4 17.6 4 19l1.4-4.4Z" />
    <path d="M14.5 5.5 18.5 9.5" />
  </Base>
);

/* ---------- ไอคอนของหน้าติดตั้งแอปและหน้าออฟไลน์ ---------- */

export const WifiOffIcon = (p: IconProps) => (
  <Base {...p}><path d="m2 2 20 20" /><path d="M8.5 16.4a5 5 0 0 1 7 0" /><path d="M5 12.9a10 10 0 0 1 4.2-2.5" /><path d="M14.8 10.4a10 10 0 0 1 4.2 2.5" /><path d="M2 8.8A15 15 0 0 1 7.4 5.8" /><path d="M12 5a15 15 0 0 1 10 3.8" /><path d="M12 20h.01" /></Base>
);

/** ปุ่มแชร์ของ Safari — ขั้นตอนติดตั้งบน iPhone ต้องกดปุ่มนี้ */
export const ShareIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 15V3" /><path d="m8 7 4-4 4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /></Base>
);

export const MonitorIcon = (p: IconProps) => (
  <Base {...p}><rect x="2" y="3.5" width="20" height="14" rx="2" /><path d="M8 20.5h8M12 17.5v3" /></Base>
);

export const AndroidIcon = (p: IconProps) => (
  <Base {...p}><rect x="5" y="8" width="14" height="12" rx="3" /><path d="M8.5 8 7 5M15.5 8 17 5" /><path d="M9.5 12h.01M14.5 12h.01" /></Base>
);

/** งานเข้าใหม่ — ถาดรับเอกสาร */
export const InboxIcon = (p: IconProps) => (
  <Base {...p}><path d="M3 12h5l2 3h4l2-3h5" /><path d="M4 6h16l1 6v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z" /></Base>
);
/** วางแผนงาน — แถบงานพร้อมหมุดปรับ */
export const PlanBoardIcon = (p: IconProps) => (
  <Base {...p}><path d="M4 6h9M4 12h14M4 18h7" /><path d="M17 4v4M20 10v4M14 16v4" /></Base>
);
/** โปรเจค */
export const ProjectIcon = (p: IconProps) => (
  <Base {...p}><rect x="3" y="4" width="18" height="17" rx="2.4" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="M8 14h3M8 17h6" /></Base>
);
/** ทีมงาน */
export const TeamIcon = (p: IconProps) => (
  <Base {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4" /><path d="M16 11.2A3.2 3.2 0 1 0 16 4.8" /><path d="M18 20c0-2.6-1-4.4-2.6-5.4" /></Base>
);

/** แดชบอร์ดบัญชี */
export const AccBoardIcon = (p: IconProps) => (
  <Base {...p}><rect x="3" y="3" width="7.5" height="8" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="5" rx="1.6" /><rect x="3" y="14" width="7.5" height="7" rx="1.6" /><rect x="13.5" y="11" width="7.5" height="10" rx="1.6" /></Base>
);
/** วางบิล — ใบแจ้งหนี้ */
export const BillingIcon = (p: IconProps) => (
  <Base {...p}><path d="M6 3h9l5 5v13H6Z" /><path d="M14 3v6h6" /><path d="M9 13h7M9 17h5" /></Base>
);
/** ใบเสร็จรับเงิน */
export const ReceiptIcon = (p: IconProps) => (
  <Base {...p}><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" /><path d="M9 8h6M9 12h6" /></Base>
);
/** ภาษีหัก ณ ที่จ่าย */
export const TaxIcon = (p: IconProps) => (
  <Base {...p}><path d="M4 20 20 4" /><circle cx="7" cy="7" r="2.6" /><circle cx="17" cy="17" r="2.6" /></Base>
);
export const ShieldIcon = (p: IconProps) => (
  <Base {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></Base>
);
export const CrosshairIcon = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="8" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></Base>
);

/* ข้อต่อโซ่ — ลิงก์ภายนอก เช่นข้อเสนอแบบ Canva */
export const LinkIcon = (p: IconProps) => (
  <Base {...p}><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></Base>
);
/** แนบสัญญา (ต้นแบบ ceo-deals.html) */
export const PaperclipIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8-8a3.5 3.5 0 1 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" />
  </Base>
);

/** มือจับสำหรับลากเรียงลำดับ — จุดหกจุดตามต้นแบบ hr-settings.html */
export const GripIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);
