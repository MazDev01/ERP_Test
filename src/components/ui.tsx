/*
 * UI primitives ตาม design system (Kids Kingdom / MAZ)
 * ทุกตัวใช้ token จาก globals.css เท่านั้น ห้าม hardcode สี
 */
import { cloneElement, isValidElement, useId } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ─── Card ─────────────────────────────────────────────────────────
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass overflow-hidden rounded-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-4 py-4 sm:px-6", className)}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t border-border/70 bg-muted px-4 py-3 sm:px-6">
      {children}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────
type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default: "btn-solid",
  secondary: "glass-thin text-foreground hover:bg-muted",
  outline: "glass-thin text-muted-foreground hover:text-foreground",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:brightness-110",
  link: "text-primary underline underline-offset-2",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-xs rounded-md",
  sm: "h-7 px-2.5 text-sm rounded-md",
  md: "h-8 px-3 text-sm rounded-lg",
  lg: "h-9 px-4 text-sm rounded-lg",
  icon: "size-8 rounded-md",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** React 19 ส่ง ref เป็น prop ปกติ ไม่ต้อง forwardRef */
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

// ─── Badge ────────────────────────────────────────────────────────
type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "success"
  | "warning";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-[var(--info-soft)] text-[var(--info)]",
  outline: "border border-border text-foreground",
  ghost: "bg-[var(--neutral-soft)] text-[var(--neutral)]",
  destructive: "bg-[var(--destructive-soft)] text-destructive",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
};

export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Input / Label ────────────────────────────────────────────────
export function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium">
      {children}
    </label>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        /* ขอบสีเทาของธีม — ขอบขาวที่เหลือจากธีมกระจกกลืนไปกับพื้นกล่องขาวจนมองไม่เห็นช่อง */
        "h-9 w-full rounded-[10px] border border-border bg-white px-3 text-sm outline-none",
        "transition",
        "hover:border-[#d4d4d4] focus:border-ring",
        "placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full appearance-none rounded-[10px] border border-border bg-white py-0 pr-8 pl-3 text-sm outline-none",
        "transition",
        "hover:border-[#d4d4d4] focus:border-ring",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23999%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E')] bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-[10px] border border-border bg-white px-3 py-2 text-sm outline-none",
        "transition",
        "hover:border-[#d4d4d4] focus:border-ring",
        "placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** ช่องกรอกมาตรฐานตาม design system (h32, พื้นโปร่ง, เส้นขอบ, radius-lg) */
export const FILLED_FIELD =
  "h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none " +
  "transition focus:border-ring focus:ring-3 focus:ring-primary/20";

export function Field({
  label,
  htmlFor,
  required,
  children,
  hint,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  /*
   * ผูก label เข้ากับช่องกรอกให้เอง เพราะเกือบทุกที่เรียก Field โดยไม่ส่ง htmlFor
   * ไม่ผูกไว้ โปรแกรมอ่านหน้าจอจะอ่านช่องนั้นว่า "ช่องกรอก" เฉย ๆ ไม่รู้ว่าเป็นช่องอะไร
   * ผูกเฉพาะตอนลูกเป็นช่องกรอกเดี่ยวที่ยังไม่มี id — ลูกที่เป็นกล่องห่อหลายชิ้นต้องใส่ aria-label เอง
   */
  const auto = useId();
  const id = htmlFor ?? auto;
  const kid = fieldControl(children) && !children.props.id ? cloneElement(children, { id }) : children;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-[0.8rem] font-medium">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {kid}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** ลูกของ Field ที่รับ id ไปผูกกับ label ได้ — ช่องกรอกจริงหรือตัวห่อบางของเราเท่านั้น */
function fieldControl(v: ReactNode): v is ReactElement<{ id?: string }> {
  if (!isValidElement<{ id?: string }>(v)) return false;
  if (typeof v.type === "string") return ["input", "select", "textarea"].includes(v.type);
  return v.type === Input || v.type === Select || v.type === Textarea;
}

export function RequiredNote() {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="text-destructive">*</span> จำเป็นต้องมี
    </p>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────
const AVATAR_SIZES = {
  sm: "size-6 text-[0.65rem]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-14 text-base",
} as const;

export function Avatar({
  name,
  size = "md",
  tone = "accent",
  className,
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZES;
  tone?: "accent" | "primary" | "muted";
  className?: string;
}) {
  const tones = {
    accent: "bg-accent text-primary",
    primary: "bg-primary text-primary-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        AVATAR_SIZES[size],
        tones[tone],
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** ย่อชื่อเป็นตัวอักษรแรกของสองคำแรก (ไทยตัดสระนำไม่ได้ จึงใช้อักษรแรกตรง ๆ) */
function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");
}

// ─── Progress ─────────────────────────────────────────────────────
export function Progress({
  value,
  tone = "primary",
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const tones = {
    primary: "bg-primary",
    success: "bg-[var(--chart-4)]",
    warning: "bg-[var(--chart-2)]",
    danger: "bg-destructive",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width]", tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────
export function StatTile({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl bg-card px-5 py-5 shadow-[0_1px_3px_rgb(0_0_0/0.04)]">
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <p className="tabular mt-2 text-2xl leading-tight font-bold break-words sm:text-3xl">
        {value}
      </p>
      {/* mt-auto ดันบรรทัดล่างชิดก้นการ์ด ทุกช่องจึงสูงเท่ากัน */}
      {hint && <div className="mt-auto pt-2 text-xs sm:text-sm">{hint}</div>}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "sticky top-0 z-1 bg-muted px-4 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground whitespace-nowrap",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("border-t border-border/60 px-4 py-3.5 align-top", className)}>
      {children}
    </td>
  );
}

// ─── Alert ────────────────────────────────────────────────────────
type AlertTone = "info" | "success" | "warning" | "error";

const ALERT_TONES: Record<AlertTone, string> = {
  info: "bg-[var(--info-soft)] border-[var(--info)]/20 text-[var(--info)]",
  success:
    "bg-[var(--success-soft)] border-[var(--success)]/20 text-[var(--success)]",
  warning:
    "bg-[var(--warning-soft)] border-[var(--warning)]/20 text-[var(--warning)]",
  error: "bg-[var(--destructive-soft)] border-destructive/20 text-destructive",
};
export function Alert({
  tone = "info",
  icon,
  title,
  children,
  role = "status",
}: {
  tone?: AlertTone;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        ALERT_TONES[tone],
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <strong className="block font-semibold">{title}</strong>}
        <div className="break-words">{children}</div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden="true" />;
}

// ─── Separator ────────────────────────────────────────────────────
export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px bg-border", className)} role="separator" />;
}

// ─── Section: หัวข้อย่อยแบบเบา ๆ แทนการ์ดซ้อนการ์ด ────────────────
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-8", className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ─── Chip: ตัวกรองแบบกดเลือก กรองทันทีไม่ต้องกดค้นหา ───────────────
export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "btn-solid"
          : "glass-thin text-muted-foreground hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-3 sm:mb-8">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
