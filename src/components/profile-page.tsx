"use client";

import { enableNotify, isIOS, useHydrated, usePwa } from "@/lib/pwa";
import { Switch } from "./admin-ui";
import { pushSupported, subscribeThisDevice, unsubscribeThisDevice, useThisDevice } from "@/lib/push-subs";

import { bkkNow, parseIsoDate, thaiDate } from "@/lib/format";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import "@/styles/mobile/profile.css";
import { useRole } from "@/lib/role";
import { useProfile } from "@/lib/profile-data";
import { useHr } from "@/lib/hr-store";
import {
  HR_EMPTYPE,
  HR_STATUS,
  ROLE_EMPLOYEE,
  accountRoles,
  hrDept,
  hrPos,
  posOf,
  type Employee,
} from "@/lib/hr-data";
import { setProfilePhoto, useProfilePhoto } from "@/lib/profile-store";
import {
  BOTNAV_SLOTS,
  botnavChoices,
  botnavDefault,
  botnavOf,
  resetBotnav,
  setBotnav,
  useBotnavPrefs,
} from "@/lib/botnav-prefs";
import { navItemsOf, useMenuAccess } from "@/lib/nav";
import { useMyMine, useMyRoles } from "@/lib/hr-link";
import { useApprovalRoute } from "@/lib/role";
import { ICONS } from "./app-shell";
import {
  BellIcon,
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  GridIcon,
  HomeIcon,
  LockIcon,
  LogoutIcon,
  UserIcon,
} from "./icons";
import { PhotoCropper } from "./photo-cropper";

type Pane = "profile" | "notify" | "security" | "botnav";

const PANES: { key: Pane; label: string; icon: React.ReactNode }[] = [
  { key: "profile", label: "ข้อมูลส่วนตัว", icon: <UserIcon className="size-4" /> },
  { key: "notify", label: "การแจ้งเตือน", icon: <BellIcon className="size-4" /> },
  { key: "security", label: "รหัสผ่าน", icon: <LockIcon className="size-4" /> },
  /* ไม่มีแผงตั้งแถบเมนูล่างแล้ว (ผู้ใช้สั่ง 9 ต.ค. 2569) */
];

/** ชื่อหัวจอของแต่ละแผงบนมือถือ — ตามต้นแบบ profile-glass.html */
const MOBILE_TITLE: Record<Pane, string> = {
  profile: "ข้อมูลส่วนตัว",
  notify: "การแจ้งเตือน",
  security: "เปลี่ยนรหัสผ่าน",
  botnav: "แถบเมนูล่าง",
};

/** กระเป๋าทำงานหน้าตำแหน่งงาน — ไม่มีใน icons.tsx จึงวาดไว้ที่นี่ (ใช้เฉพาะหน้ารวมบนมือถือ) */
function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </svg>
  );
}

export function ProfilePage() {
  const params = useSearchParams();
  /*
   * ผู้ดูแลระบบเป็นบัญชีสำหรับควบคุมระบบ ไม่ใช่คนในทะเบียน (เจ้าของสั่ง 25 ก.ย. 2569)
   * จึงไม่มีข้อมูลส่วนตัวและไม่มีรูป เหลือเฉพาะรหัสผ่านกับการแจ้งเตือนที่จำเป็นต่อการเข้าใช้งาน
   */
  const panes = PANES;
  const fallback: Pane = "profile";
  const tab = params.get("tab") as Pane | null;
  const [saved, setSaved] = useState<string | null>(null);
  const initial = tab || fallback;
  const [pane, setPane] = useState<Pane>(initial);
  /*
   * มือถือ (ต้นแบบ profile-glass.html): ไม่มี ?tab= = หน้ารวม (การ์ดโปรไฟล์ + แถวเมนู)
   * มี ?tab= = เปิดแผงนั้นเต็มจอ ปุ่มย้อนกลับของเบราว์เซอร์จึงพากลับหน้ารวมได้
   * จอคอมไม่ใช้ค่านี้ ยังเปิดแผงด้วย state เหมือนเดิม — แค่ตามค่า ?tab= ที่เปลี่ยนจากมือถือ
   */
  const router = useRouter();
  const [lastTab, setLastTab] = useState(tab);
  const pushed = useRef(false);
  if (tab !== lastTab) {
    setLastTab(tab);
    if (tab) setPane(tab);
    setSaved(null);
  }
  function openMobile(p: Pane) {
    pushed.current = true;
    router.push(`/profile?tab=${p}`, { scroll: true });
  }
  function closeMobile() {
    if (pushed.current) {
      pushed.current = false;
      router.back();
    } else router.replace("/profile", { scroll: true });
  }
  /*
   * แผงที่เปิดอยู่จริง — บทบาทอ่านจาก localStorage จึงรู้หลัง hydrate
   * ถ้ายึดค่าที่ตั้งไว้ตอนเรนเดอร์แรก ผู้ดูแลระบบจะค้างอยู่ที่แผง "ข้อมูลส่วนตัว" ที่ไม่มีให้ดู แล้วจอว่างเปล่า
   */
  const current = panes.some((p) => p.key === pane) ? pane : fallback;
  const mobileScreen = tab && panes.some((p) => p.key === tab) ? "pane" : "landing";

  function flash(message: string) {
    setSaved(message);
  }

  return (
    <div
      className="pf-m grid grid-cols-[minmax(0,1fr)] items-start gap-[22px] lg:grid-cols-[262px_minmax(0,1fr)]"
      data-m={mobileScreen}
    >
      {/* พื้นไล่ชมพูด้านบน — มีเฉพาะมือถือ (ซ่อนด้วย hidden แล้ว profile.css เปิดเองบนจอแคบ) */}
      <div className="pf-glow hidden" aria-hidden="true" />
      {/* ชื่อหน้ามุมซ้ายบน (จอคอม) — แถบบนเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
      <h1 className="page-h1 lg:col-span-2">โปรไฟล์ของฉัน</h1>
      <ProfileCard
        pane={current}
        panes={panes}
        onPane={(p) => { setPane(p); setSaved(null); }}
        onOpenMobile={openMobile}
      />

      <div className="pf-pane min-w-0">
        {/* หัวหน้าจอของแผงบนมือถือ — ปุ่มกลมย้อนกลับไปหน้ารวม ชื่อแผงอยู่กลาง */}
        <header className="pf-head hidden">
          <button type="button" className="pf-back" aria-label="ย้อนกลับ" onClick={closeMobile}>
            <ChevronLeftIcon className="size-5" strokeWidth={2.4} />
          </button>
          <h1>{MOBILE_TITLE[current]}</h1>
          <span aria-hidden="true" />
        </header>
        {saved && (
          <p className="mb-[18px] flex items-center gap-[11px] rounded-[14px] bg-[var(--success-soft)] px-[17px] py-3 text-[13.5px] font-medium text-[var(--success)]">
            <CheckIcon className="size-[18px] shrink-0" strokeWidth={2.4} />
            {saved}
          </p>
        )}
        {current === "profile" && <PersonalPane />}
        {current === "notify" && <NotifyPane />}
        {current === "security" && <SecurityPane onSaved={flash} />}
        {false && current === "botnav" && <BotnavPane onSaved={flash} />}
      </div>
    </div>
  );
}

// ─── การ์ดซ้าย ────────────────────────────────────────────────────
function ProfileCard({
  pane,
  panes,
  onPane,
  onOpenMobile,
}: {
  pane: Pane;
  panes: typeof PANES;
  onPane: (p: Pane) => void;
  onOpenMobile: (p: Pane) => void;
}) {
  const photo = useProfilePhoto();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropping(String(reader.result));
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  /* ชื่อ–ตำแหน่งบนการ์ดอ่านจากทะเบียนฝ่ายบุคคลก่อน (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const prof = useProfile();
  const emp = useMyEmployee();
  const me = {
    name: emp?.name ?? prof.name,
    position: emp ? hrPos(emp.pos).label : prof.position,
  };
  const short = me.name.split(" ").map((s) => s[0]).join("").slice(0, 2);

  /* แถวเมนูของหน้ารวมบนมือถือ — แผงข้อมูลส่วนตัวเปิดจากปุ่มแดงในการ์ดแทน */
  const rows = panes.filter((p) => p.key !== "profile");

  return (
    <>
    {/* ── มือถือ: หน้ารวมตามต้นแบบ profile-glass.html (จอคอมซ่อนด้วย hidden) ── */}
    <div className="pf-land hidden">
      <section className="pf-hero">
        <span className="pf-ava">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" />
          ) : (
            <span>{short}</span>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="pf-cam"
            aria-label="เปลี่ยนรูปโปรไฟล์"
          >
            <CameraIcon className="size-[15px]" strokeWidth={2.2} />
          </button>
        </span>
        <h2>{me.name}</h2>
        {me.position && (
          <p>
            <BriefcaseIcon className="size-[15px] flex-none" />
            <span className="truncate">{me.position}</span>
          </p>
        )}
        {panes.some((p) => p.key === "profile") && (
          <button type="button" className="pf-edit" onClick={() => onOpenMobile("profile")}>
            {/* ดูอย่างเดียว ไม่ใช่ปุ่มแก้ไข (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
            <UserIcon className="size-4" />
            ข้อมูลส่วนตัว
          </button>
        )}
      </section>

      <div className="pf-rows">
        {rows.map((p) => (
          <button key={p.key} type="button" className="pf-row" onClick={() => onOpenMobile(p.key)}>
            <span className="pf-row-ico">{p.icon}</span>
            <span className="pf-row-lbl">{p.key === "security" ? "เปลี่ยนรหัสผ่าน" : p.label}</span>
            <ChevronRightIcon className="pf-row-cv size-[18px]" />
          </button>
        ))}
      </div>
      <div className="pf-rows">
        <Link href="/install" className="pf-row">
          <span className="pf-row-ico">
            <DownloadIcon className="size-4" />
          </span>
          <span className="pf-row-lbl">ติดตั้งแอป</span>
          <ChevronRightIcon className="pf-row-cv size-[18px]" />
        </Link>
      </div>
      <div className="pf-rows">
        <a href="/login" className="pf-row pf-row-out">
          <span className="pf-row-ico">
            <LogoutIcon className="size-4" />
          </span>
          <span className="pf-row-lbl">ออกจากระบบ</span>
        </a>
      </div>
    </div>

    <aside className="pf-desk glass rounded-[20px] px-4 py-4 sm:px-5 lg:sticky lg:top-[88px] lg:pt-[26px] lg:pb-[18px] lg:text-center">
      <div className="flex items-center gap-4 lg:block">
      {/* เปลี่ยนรูปได้ทุกบทบาท รวมผู้ดูแลระบบ (เจ้าของสั่ง 25 ก.ย. 2569)
          รูปเป็นของบัญชี ไม่ใช่ข้อมูลส่วนตัวของคน บัญชีควบคุมระบบจึงตั้งรูปประจำบัญชีได้ */}
      <span className="relative inline-block shrink-0">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="size-16 rounded-full object-cover lg:size-[104px]"
          />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-accent text-xl font-bold text-primary lg:size-[104px] lg:text-[34px]">
            {short}
          </span>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="absolute -right-0.5 -bottom-0.5 grid size-7 place-items-center rounded-full border-[3px] border-white bg-primary text-white transition-colors hover:bg-primary-hover lg:right-0.5 lg:bottom-0.5 lg:size-[30px]"
          aria-label="เปลี่ยนรูปโปรไฟล์"
        >
          <CameraIcon className="size-[15px]" strokeWidth={2.2} />
        </button>
      </span>

        {/* ผู้ดูแลระบบไม่มีชื่อคนและไม่มีตำแหน่ง — บรรทัดเดียวว่า "ผู้ดูแลระบบ" พอ (เจ้าของสั่ง 25 ก.ย. 2569) */}
        <div className="min-w-0 lg:mt-3.5">
          <h2 className="truncate text-[17px] font-semibold">{me.name}</h2>
          {(
            <p className="mt-[3px] truncate text-[13px] text-muted-foreground">
              {me.position}
            </p>
          )}
        </div>
      </div>

      {/*
        มือถือ: สามช่องเท่า ๆ กันในแถวเดียว ไอคอนอยู่บน ชื่ออยู่ล่าง · ออกจากระบบกินเต็มแถวถัดไป
        เดิมเป็นชิปเรียงแถวเดียวที่ต้องเลื่อนซ้ายขวา ปุ่มท้ายแถวจึงถูกซ่อนอยู่นอกจอ
        คนที่ไม่รู้ว่าเลื่อนได้จะหาไม่เจอ (เจ้าของแจ้ง 25 ก.ย. 2569)
        จอใหญ่: เมนูแนวตั้งเหมือนเดิม
      */}
      <div className="mt-4 grid grid-cols-3 gap-2 lg:mt-5 lg:flex lg:flex-col lg:gap-1 lg:text-left">
        {panes.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPane(p.key)}
            className={`flex min-w-0 flex-col items-center justify-start gap-1 rounded-[14px] px-2 py-2.5 text-[12px] leading-tight font-medium transition-colors lg:w-full lg:flex-row lg:gap-[11px] lg:rounded-xl lg:px-3.5 lg:py-[11px] lg:text-[13.5px] ${
              pane === p.key
                ? "bg-accent font-semibold text-primary"
                : "bg-secondary text-muted-foreground lg:bg-transparent lg:hover:bg-muted lg:hover:text-foreground"
            }`}
          >
            {p.icon}
            <span className="min-w-0 text-center lg:text-left">{p.label}</span>
          </button>
        ))}
        <hr className="mx-1 my-1.5 hidden border-border lg:block" />
        <a
          href="/login"
          className="col-span-3 flex items-center justify-center gap-2 rounded-[14px] bg-secondary px-3.5 py-2.5 text-[13px] font-medium text-primary transition-colors lg:w-full lg:justify-start lg:gap-[11px] lg:rounded-xl lg:bg-transparent lg:py-[11px] lg:hover:bg-accent/60"
        >
          <LogoutIcon className="size-4" />
          ออกจากระบบ
        </a>
      </div>
    </aside>

    {/* ช่องเลือกไฟล์กับกล่องครอปอยู่นอกการ์ด — การ์ดจอคอมถูกซ่อนบนมือถือ ปุ่มกล้องทั้งสองที่จึงใช้ช่องเดียวกัน
        sr-only เป็น absolute และกล่องครอปยิงออกไปที่ body จึงไม่กินช่องของกริด */}
    <input
      ref={fileRef}
      type="file"
      accept="image/jpeg,image/png,image/gif"
      aria-label="เลือกไฟล์รูปโปรไฟล์"
      className="sr-only"
      onChange={(e) => pick(e.target.files?.[0])}
    />
    {cropping && (
      <PhotoCropper
        src={cropping}
        onCancel={() => setCropping(null)}
        onDone={(url) => {
          setProfilePhoto(url);
          setCropping(null);
        }}
      />
    )}
    </>
  );
}

// ─── ข้อมูลส่วนตัว ────────────────────────────────────────────────
/* อ่านอย่างเดียวจากทะเบียนพนักงานที่ฝ่ายบุคคลกรอก — พนักงานแก้เองไม่ได้แล้ว (ผู้ใช้สั่ง 13 ต.ค. 2569) */
function useMyEmployee(): Employee | undefined {
  const role = useRole();
  const hr = useHr();
  return (
    hr.emp.find((e) => e.id === ROLE_EMPLOYEE[role]) ??
    hr.emp.find((e) => accountRoles(e.account).includes(role))
  );
}

function PersonalPane() {
  const me = useProfile();
  const emp = useMyEmployee();
  const hr = useHr();
  const boss = emp?.boss ? hr.emp.find((e) => e.id === emp.boss)?.name : "";
  const age = ageFrom(emp?.birth ?? "");

  const groups: { title: string; rows: { label: string; value?: string; wide?: boolean; tel?: boolean }[]; sos?: boolean }[] = [
    {
      title: "ข้อมูลทั่วไป",
      rows: [
        { label: "ชื่อ–สกุล", value: emp?.name ?? me.name },
        { label: "ชื่อเล่น", value: emp?.nick },
        { label: "เพศ", value: emp?.sex },
        { label: "วัน/เดือน/ปีเกิด", value: emp?.birth ? thaiDate(emp.birth) : "" },
        { label: "อายุ", value: age },
        { label: "เบอร์ติดต่อ", value: emp?.phone ?? me.phone },
        { label: "อีเมล", value: emp?.email ?? me.email },
        { label: "ที่อยู่", value: emp?.address, wide: true },
      ],
    },
    {
      title: "ข้อมูลการทำงาน",
      rows: [
        {
          label: "ตำแหน่ง",
          value: emp ? posOf(emp).map((p) => hrPos(p).label).join(" · ") : me.position,
        },
        { label: "แผนก", value: emp ? hrDept(hrPos(emp.pos).dept).label : me.department },
        { label: "ประเภทพนักงาน", value: emp ? HR_EMPTYPE[emp.type]?.label : me.employmentType },
        { label: "สถานะ", value: emp ? HR_STATUS[emp.status]?.label : "" },
        {
          label: "วันที่เริ่มงาน",
          value: emp?.startedAt ? thaiDate(emp.startedAt) : me.startDate ? thaiDate(me.startDate) : "",
        },
      ],
    },
    {
      title: "การศึกษาและประสบการณ์",
      rows: [
        { label: "การศึกษา", value: emp?.edu, wide: true },
        { label: "ประสบการณ์ทำงาน", value: emp?.exp.filter(Boolean).join("\n"), wide: true },
      ],
    },
    {
      /* ผู้ติดต่อฉุกเฉินเป็นกล่องแยก เบอร์กดโทรได้ — ชื่อเดียวกับหน้าฝ่ายบุคคล (ผู้ใช้สั่ง 15 ต.ค. 2569) */
      title: "ผู้ติดต่อฉุกเฉิน",
      sos: true,
      rows: [
        { label: "ชื่อ–สกุล", value: emp?.sos.name },
        { label: "ความสัมพันธ์", value: emp?.sos.rel },
        { label: "โทรศัพท์", value: emp?.sos.phone, tel: true },
      ],
    },
  ];

  return (
    <section className="pf-sheet glass rounded-[20px] px-4 py-5 sm:px-7 sm:py-[26px]">
      <h2 className="pf-intro text-lg font-semibold">ข้อมูลส่วนตัว</h2>
      {groups.map((g) => (
        <div
          key={g.title}
          className={`pf-grp ${g.sos ? "pf-sos mt-4 rounded-[14px] border border-border border-l-4 border-l-[var(--destructive)] bg-card px-4 py-3.5" : ""}`}
        >
          <H3>{g.title}</H3>
          <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            {g.rows.map((r) => (
              <div key={r.label} className={`min-w-0 ${r.wide ? "sm:col-span-2" : ""}`}>
                <dt className="text-[12px] font-normal text-muted-foreground/70">{r.label}</dt>
                <dd className="mt-0.5 text-[15px] font-semibold text-foreground leading-relaxed break-words whitespace-pre-line">
                  {r.value?.trim() ? (
                    r.tel ? (
                      <a href={`tel:${r.value.replace(/[^\d+]/g, "")}`} className="num text-primary underline underline-offset-2">
                        {r.value}
                      </a>
                    ) : (
                      r.value
                    )
                  ) : <span className="text-muted-foreground/60">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

// ─── การแจ้งเตือน ─────────────────────────────────────────────────
/*
 * เหลือกล่องเดียว "การแจ้งเตือนบนอุปกรณ์นี้" (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * เอารายการเรื่อง / ช่องป๊อปอัป-เสียง-สั่น / เวลาเตือน / ปิดเสียงพักกลางวัน / ปุ่มบันทึก ออกทั้งหมด
 * เรื่องที่ส่งระบบเลือกตามบทบาท (topicsForRoles) · เวลาเตือนใช้เวลาทำงานของระบบ (reminderTimes)
 */
function NotifyPane() {
  const role = useRole();
  const empId = ROLE_EMPLOYEE[role];
  const pwa = usePwa();
  const hydrated = useHydrated();
  const device = useThisDevice(empId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ios = hydrated && isIOS();

  const supported = hydrated && pushSupported();
  const perm = pwa.notify;
  const subscribed = perm === "granted" && !!device;
  const state: "loading" | "unsupported" | "blocked" | "on" | "off" | "idle" = !hydrated
    ? "loading"
    : !supported
      ? "unsupported"
      : perm === "denied"
        ? "blocked"
        : subscribed
          ? device.enabled
            ? "on"
            : "off"
          : "idle";

  async function turnOn() {
    if (!empId) return;
    setBusy(true);
    setMsg(null);
    /* ขอสิทธิ์ก่อนอย่างอื่น — iOS ยอมให้ขอเฉพาะตอนที่ผู้ใช้เพิ่งกดปุ่ม */
    const r = await enableNotify();
    if (r.ok) await subscribeThisDevice(empId);
    else setMsg(r.reason);
    setBusy(false);
  }

  return (
    <section className="pf-sheet glass rounded-[20px] px-4 py-5 sm:px-7 sm:py-[26px]">
      <h2 className="pf-intro text-lg font-semibold">การแจ้งเตือน</h2>

      <div className="glass-thin mt-5 rounded-[14px] px-4 py-4 text-[13.5px] sm:px-5">
        <b className="block text-[15px] font-semibold">การแจ้งเตือนบนอุปกรณ์นี้</b>

        {state === "loading" && <p className="mt-1.5 text-muted-foreground">กำลังตรวจ…</p>}

        {state === "unsupported" && (
          <p className="mt-1.5 leading-relaxed text-muted-foreground">
            อุปกรณ์นี้ไม่รองรับการแจ้งเตือน
            {ios && (
              <>
                {" "}— iPhone ต้องเพิ่มแอปไปยังหน้าจอโฮมก่อน (กดแชร์ › เพิ่มไปยังหน้าจอโฮม) แล้วเปิดจากไอคอน{" "}
                <Link href="/install" className="text-primary underline">
                  ดูวิธี
                </Link>
              </>
            )}
          </p>
        )}

        {state === "blocked" && (
          <div className="mt-1.5 leading-relaxed text-muted-foreground">
            <p>การแจ้งเตือนถูกบล็อกไว้ในเบราว์เซอร์ ต้องอนุญาตที่การตั้งค่าของเว็บไซต์ก่อน แล้วโหลดหน้านี้ใหม่</p>
            <ul className="mt-2 grid gap-1 text-[12.5px]">
              <li>
                <b className="font-semibold text-foreground">Chrome / Edge:</b> แตะไอคอนหน้าที่อยู่เว็บ › สิทธิ์ ›
                การแจ้งเตือน › อนุญาต
              </li>
              <li>
                <b className="font-semibold text-foreground">Safari (iPhone):</b> การตั้งค่า › การแจ้งเตือน › ERP MAZ ›
                อนุญาตการแจ้งเตือน
              </li>
            </ul>
          </div>
        )}

        {(state === "on" || state === "off") && empId && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className={state === "on" ? "font-medium text-[var(--success)]" : "text-muted-foreground"}>
              {state === "on" ? "เปิดอยู่บนอุปกรณ์นี้" : "ปิดอยู่บนอุปกรณ์นี้"}
            </span>
            <Switch
              on={state === "on"}
              label="การแจ้งเตือนบนอุปกรณ์นี้"
              disabled={busy}
              onToggle={async () => {
                if (state === "on") return unsubscribeThisDevice(empId);
                setBusy(true);
                await subscribeThisDevice(empId);
                setBusy(false);
              }}
            />
          </div>
        )}

        {state === "idle" && (
          <>
            <p className="mt-1.5 leading-relaxed text-muted-foreground">
              ยังไม่ได้เปิด — เปิดแล้วจะได้รับแจ้งเตือนเรื่องงานของคุณบนอุปกรณ์นี้ แม้ไม่ได้เปิดแอปอยู่
            </p>
            <button
              type="button"
              disabled={busy || !empId}
              onClick={turnOn}
              className="btn-solid mt-3 h-11 w-full rounded-[22px] px-5 text-sm font-semibold disabled:opacity-45 sm:w-auto"
            >
              {busy ? "กำลังเปิด…" : "เปิดการแจ้งเตือน"}
            </button>
          </>
        )}

        {msg && (
          <p role="status" className="mt-3 rounded-[11px] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[13px] text-destructive">
            {msg}
          </p>
        )}
      </div>
    </section>
  );
}

// ─── รหัสผ่าน ─────────────────────────────────────────────────────
function SecurityPane({ onSaved }: { onSaved: (m: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const nextProblem = next ? passwordProblem(next) : "";
  const mismatch = confirm.length > 0 && confirm !== next;

  function save() {
    setTouched(true);
    if (!current || !next || nextProblem || confirm !== next) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setTouched(false);
    onSaved("เปลี่ยนรหัสผ่านเรียบร้อย");
  }

  return (
    <section className="pf-sheet glass rounded-[20px] px-4 py-5 sm:px-7 sm:py-[26px]">
      <h2 className="pf-intro text-lg font-semibold">รหัสผ่าน</h2>
      <p className="pf-intro mt-1 text-[13px] text-muted-foreground">
        เปลี่ยนรหัสผ่านที่ใช้เข้าสู่ระบบ
      </p>

      <div className="pf-grp pf-pwgrid mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <F
            label="รหัสผ่านปัจจุบัน"
            required
            error={touched && !current ? "กรอกรหัสผ่านปัจจุบัน" : undefined}
          >
            <input
              type="password"
              className="field-control h-12 rounded-xl px-[15px] text-sm"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </F>
        </div>
        <F
          label="รหัสผ่านใหม่"
          required
          className="pf-pwnew"
          error={nextProblem || (touched && !next ? "กรอกรหัสผ่านใหม่" : undefined)}
          hint="อย่างน้อย 8 ตัวอักษร · พิมพ์ใหญ่ · พิมพ์เล็ก · ตัวเลข · อักขระพิเศษ"
        >
          <input
            type="password"
            autoComplete="new-password"
            className="field-control h-12 rounded-xl px-[15px] text-sm"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </F>
        {/* มือถือ: เงื่อนไขรหัสผ่านใหม่ ข้อที่ผ่านเป็นเครื่องหมายถูกสีเขียวทันทีที่พิมพ์ (ต้นแบบ #pgRules)
            ใช้เกณฑ์เดียวกับ passwordProblem · จอคอมซ่อน (hidden) จึงไม่กินช่องกริด */}
        <ul className="pf-rules hidden" aria-live="polite">
          {PW_RULES.map((r) => (
            <li key={r.label} className={r.test(next) ? "ok" : undefined}>
              <span className="pf-dot" aria-hidden="true">
                <CheckIcon className="size-[11px]" strokeWidth={3} />
              </span>
              {r.label}
            </li>
          ))}
        </ul>
        <F
          label="ยืนยันรหัสผ่านใหม่"
          required
          error={mismatch ? "รหัสผ่านยืนยันไม่ตรงกัน" : undefined}
        >
          <input
            type="password"
            className="field-control h-12 rounded-xl px-[15px] text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </F>
      </div>

      <div className="pf-bar mt-[26px] grid gap-3.5 sm:grid-cols-2">
        <button
          type="button"
          className="h-12 rounded-[14px] border-[1.5px] border-primary bg-white text-[14.5px] font-semibold text-primary transition-colors hover:bg-accent"
          onClick={() => {
            setCurrent("");
            setNext("");
            setConfirm("");
            setTouched(false);
          }}
        >
          <CancelLabel />
        </button>
        <button
          type="button"
          className="btn-solid h-12 rounded-[14px] text-[14.5px] font-semibold"
          onClick={save}
        >
          เปลี่ยนรหัสผ่าน
        </button>
      </div>
    </section>
  );
}

// ─── ชิ้นส่วนร่วม ─────────────────────────────────────────────────
function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-3 text-xs font-bold tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function F({
  label,
  required,
  hint,
  error,
  wide,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** มือถือ: กินเต็มแถวของกริดสองคอลัมน์ (จอคอมไม่มีผล) */
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`pf-f${wide ? " pf-wide" : ""}${className ? ` ${className}` : ""}`}>
      <label className="mb-[7px] block text-[12.5px] font-medium text-muted-foreground">
        {label}
        {required && <em className="ml-0.5 text-primary not-italic">*</em>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="pf-hint mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ageFrom(iso: string) {
  if (!iso) return "";
  /* วันเกิดเป็น yyyy-mm-dd — new Date(iso) จะได้เที่ยงคืน UTC แล้วถอยไปวันก่อนบนเครื่องนอกไทย */
  const b = parseIsoDate(iso);
  const t = bkkNow();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a -= 1;
  return a >= 0 ? `${a} ปี` : "";
}

/** เงื่อนไขรหัสผ่านทีละข้อ — รายการติ๊กบนมือถือ (ตรงกับ passwordProblem ด้านล่าง) */
const PW_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "อย่างน้อย 8 ตัวอักษร", test: (v) => v.length >= 8 },
  { label: "ตัวพิมพ์ใหญ่", test: (v) => /[A-Z]/.test(v) },
  { label: "ตัวพิมพ์เล็ก", test: (v) => /[a-z]/.test(v) },
  { label: "ตัวเลข", test: (v) => /[0-9]/.test(v) },
  { label: "อักขระพิเศษ เช่น # @ !", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** ปุ่มยกเลิก — มือถือคำสั้น "ยกเลิก" ตามต้นแบบ จอคอมคงคำเดิม */
function CancelLabel() {
  return (
    <>
      <span className="max-md:hidden">ยกเลิกการแก้ไข</span>
      <span className="md:hidden">ยกเลิก</span>
    </>
  );
}

/** คืนข้อความบอกว่าขาดอะไร หรือ "" ถ้าผ่าน */
function passwordProblem(v: string) {
  if (v.length < 8) return `ต้องมีอย่างน้อย 8 ตัวอักษร ตอนนี้มี ${v.length} ตัว`;
  if (!/[A-Z]/.test(v)) return "ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว";
  if (!/[a-z]/.test(v)) return "ต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว";
  if (!/[0-9]/.test(v)) return "ต้องมีตัวเลขอย่างน้อย 1 ตัว";
  if (!/[^A-Za-z0-9]/.test(v)) return "ต้องมีอักขระพิเศษอย่างน้อย 1 ตัว เช่น . # / @ !";
  return "";
}

/* ─── แถบเมนูล่าง ───────────────────────────────────────────────── */

/*
 * เลือกเองว่าจะเอาหน้าไหนไว้ช่องไหนของแถบล่างบนมือถือ (เจ้าของสั่ง 25 ก.ย. 2569)
 * เป็นค่าของแต่ละคน ไม่ใช่ค่าตั้งค่าระบบ — เปลี่ยนแล้วมีผลเฉพาะเครื่องนี้และบทบาทนี้
 * เลือกได้เฉพาะหน้าที่บทบาทตัวเองเข้าได้ ไม่มีทางตั้งให้พาข้ามไปหน้าของฝ่ายอื่น
 * ปุ่มกลาง (ลงเวลา) ตรึงไว้ ไม่ให้เปลี่ยน เพราะทุกคนตอกบัตรทุกวัน
 */
function BotnavPane({ onSaved }: { onSaved: (message: string) => void }) {
  const role = useRole();
  const roles = useMyRoles();
  const access = useMenuAccess();
  const route = useApprovalRoute();
  const mine = useMyMine();
  const items = navItemsOf(roles, access, route, mine);
  const prefs = useBotnavPrefs();
  const choices = botnavChoices(items, role);
  const current = botnavOf(prefs, role) ?? botnavDefault(items, role);
  const changed = botnavOf(prefs, role) !== null;
  const used = current.filter(Boolean);
  const full = used.length >= BOTNAV_SLOTS;

  /*
   * กดครั้งเดียวจบ (เจ้าของสั่ง 25 ก.ย. 2569 ให้ใช้ง่าย)
   * กดหน้าที่ยังไม่ได้เลือก = ใส่เข้าช่องว่างช่องแรก · กดหน้าที่เลือกไว้แล้ว = เอาออก
   * เลขบนไอคอนบอกว่าหน้านั้นไปอยู่ช่องที่เท่าไรของแถบ นับจากซ้ายไปขวา
   */
  function toggle(href: string) {
    const next = [...current];
    const at = next.indexOf(href);
    if (at >= 0) {
      next[at] = "";
      setBotnav(role, next);
      onSaved("เอาออกจากแถบเมนูล่างแล้ว");
      return;
    }
    const empty = next.indexOf("");
    if (empty < 0) return;
    next[empty] = href;
    setBotnav(role, next);
    onSaved("เพิ่มเข้าแถบเมนูล่างแล้ว");
  }

  /** ช่องที่เท่าไรของแถบ (นับเฉพาะช่องที่มีของ) — ใช้เป็นเลขบนไอคอน */
  const orderOf = (href: string) => {
    const at = current.indexOf(href);
    return at < 0 ? 0 : current.slice(0, at).filter(Boolean).length + 1;
  };

  return (
    <section className="pf-card glass rounded-[20px] px-4 py-4 sm:px-6 sm:py-[22px]">
      <h2 className="pf-intro text-lg font-semibold">แถบเมนูล่าง</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        กดเลือกหน้าที่อยากให้อยู่ในแถบล่างบนมือถือ ได้สูงสุด {BOTNAV_SLOTS} หน้า
        <br />
        กดซ้ำที่หน้าเดิมเพื่อเอาออก
      </p>

      {/* แถบตัวอย่างของจริง — เลือกแล้วเห็นผลทันทีว่าหน้าตาจะเป็นแบบไหน */}
      <div className="mt-4 flex items-end justify-between gap-1 rounded-[18px] bg-muted p-2">
        {[0, 1, -1, 2, 3].map((s) => {
          if (s === -1)
            return (
              <span key="mid" className="flex flex-1 flex-col items-center gap-1 py-1.5">
                <i className="grid size-10 place-items-center rounded-full bg-primary text-white">
                  <ClockIcon className="size-5" strokeWidth={2.3} />
                </i>
                <em className="text-[10.5px] font-semibold not-italic">ลงเวลา</em>
              </span>
            );
          const found = choices.find((c) => c.href === current[s]);
          const Icon = found ? (ICONS[found.icon] ?? HomeIcon) : null;
          return (
            <span key={s} className="flex flex-1 flex-col items-center gap-1 py-1.5 text-muted-foreground">
              {Icon ? <Icon className="size-[19px]" /> : <i className="block size-[19px]" />}
              <em className="w-full truncate px-0.5 text-center text-[10.5px] not-italic">
                {found?.label ?? "ว่าง"}
              </em>
            </span>
          );
        })}
      </div>

      <p className="mt-3.5 text-[12.5px] font-semibold">
        {full ? (
          <span className="text-muted-foreground">
            ครบ {BOTNAV_SLOTS} หน้าแล้ว — กดหน้าที่เลือกไว้เพื่อเอาออกก่อน
          </span>
        ) : (
          <>
            เลือกได้อีก <span className="text-primary">{BOTNAV_SLOTS - used.length}</span> หน้า
          </>
        )}
      </p>

      {/* หน้าที่เลือกได้ — เฉพาะหน้าในเมนูของบทบาทตัวเอง จึงไม่มีทางตั้งให้ข้ามไปหน้าของฝ่ายอื่น */}
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {choices.map((c) => {
          const Icon = ICONS[c.icon] ?? HomeIcon;
          const on = current.includes(c.href);
          return (
            <button
              key={c.href}
              type="button"
              onClick={() => toggle(c.href)}
              aria-pressed={on}
              disabled={!on && full}
              className={`flex flex-col items-center justify-start gap-1.5 rounded-[14px] border px-2 py-3 text-[11.5px] leading-tight font-medium transition-colors disabled:opacity-40 ${
                on ? "border-primary bg-[var(--accent)] text-primary" : "border-border bg-card"
              }`}
            >
              <span className="relative">
                <i
                  className={`grid size-[34px] place-items-center rounded-[11px] ${
                    on ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-[18px]" />
                </i>
                {on && (
                  /* เลขบอกลำดับช่องบนแถบ — เห็นได้ทันทีว่าหน้านี้ไปอยู่ตรงไหน */
                  <em className="num absolute -top-1.5 -right-1.5 grid size-[18px] place-items-center rounded-full bg-white text-[10.5px] font-bold text-primary shadow-[0_0_0_1.5px_var(--primary)] not-italic">
                    {orderOf(c.href)}
                  </em>
                )}
              </span>
              <span className="w-full truncate text-center">{c.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn glass-thin"
          disabled={!changed}
          onClick={() => {
            resetBotnav(role);
            onSaved("คืนแถบเมนูล่างเป็นค่าตั้งต้นแล้ว");
          }}
        >
          คืนค่าตั้งต้น
        </button>
      </div>
    </section>
  );
}
