/*
 * รายละเอียดงานในใบเสนอราคาเก็บเป็น HTML เล็ก ๆ เพราะลูกค้าวางมาจาก Word
 * อนุญาตเฉพาะแท็กที่จำเป็น ตัดสคริปต์และสไตล์ทิ้งทุกครั้งทั้งตอนวางและตอนแสดง
 * hr = จุดขึ้นหน้าใหม่ตอนพิมพ์
 */

/** แท็กที่เก็บไว้ นอกจากนี้ถูกถอดเหลือแต่ข้อความข้างใน */
const KEEP = new Set([
  "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "P", "BR", "HR",
  /* ตารางในรายละเอียด (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
]);

/** แท็กที่ต้องกลายเป็นย่อหน้า เพราะ Word ส่ง div/h1-h6 มาแทน p */
const AS_PARAGRAPH = new Set(["DIV", "H1", "H2", "H3", "H4", "H5", "H6"]);

type Flags = { b: boolean; i: boolean; u: boolean; pageBreak: boolean };

/** Word ใส่ตัวหนา/เอียงมาเป็น inline style ไม่ใช่แท็ก จึงต้องอ่านจาก style ด้วย */
function flagsOf(el: Element): Flags {
  const style = el.getAttribute("style") ?? "";
  return {
    b: /font-weight\s*:\s*(bold|[6-9]00)/i.test(style),
    i: /font-style\s*:\s*italic/i.test(style),
    u: /text-decoration[^;]*underline/i.test(style),
    pageBreak:
      /page-break-before\s*:\s*always/i.test(style) ||
      /mso-special-character\s*:\s*line-break/i.test(style),
  };
}

/**
 * Google Docs ห่อทั้งเอกสารด้วย <b style="font-weight:normal">
 * ถ้าเชื่อแท็กตรง ๆ ทั้งหน้าจะกลายเป็นตัวหนา จึงต้องดูสไตล์ที่ยกเลิกไว้ด้วย
 */
function cancels(tag: string, style: string) {
  if (tag === "B") return /font-weight\s*:\s*(normal|400)/i.test(style);
  if (tag === "I") return /font-style\s*:\s*normal/i.test(style);
  if (tag === "U") return /text-decoration[^;]*none/i.test(style);
  return false;
}

function walk(src: Node, dest: HTMLElement, doc: Document) {
  src.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      dest.appendChild(doc.createTextNode(node.nodeValue ?? ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "O:P") return;

    const f = flagsOf(el);
    if (f.pageBreak) dest.appendChild(doc.createElement("hr"));

    let target = dest;
    if (KEEP.has(tag)) {
      const name = tag === "STRONG" ? "b" : tag === "EM" ? "i" : tag.toLowerCase();
      if (!cancels(name.toUpperCase(), el.getAttribute("style") ?? "")) {
        const created = doc.createElement(name);
        target.appendChild(created);
        target = created;
      }
    } else if (AS_PARAGRAPH.has(tag)) {
      const p = doc.createElement("p");
      target.appendChild(p);
      target = p;
    }

    for (const [flag, name] of [
      [f.b, "b"],
      [f.i, "i"],
      [f.u, "u"],
    ] as const) {
      if (!flag) continue;
      const created = doc.createElement(name);
      target.appendChild(created);
      target = created;
    }

    if (tag === "BR" || tag === "HR") return;
    walk(el, target, doc);
  });
}

/** ล้าง HTML ให้เหลือเฉพาะแท็กที่อนุญาต ใช้ทั้งตอนวางและตอนบันทึก */
export function cleanHtml(html: string) {
  if (typeof document === "undefined") return "";
  const src = document.createElement("div");
  src.innerHTML = String(html).replace(/<!--[\s\S]*?-->/g, "");
  const out = document.createElement("div");
  walk(src, out, document);
  return out.innerHTML;
}

/** ข้อความล้วนหลายบรรทัด → HTML ย่อหน้าละบรรทัด ใช้ตอนวางข้อความธรรมดา */
export function textToHtml(text: string) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");
}

export function escapeHtml(text: string) {
  return String(text ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

/** แบ่ง HTML เป็นหน้ากระดาษตาม <hr> ที่ผู้ใช้แทรกไว้ */
export function splitPages(html: string): string[] {
  const parts = String(html || "").split(/<hr\s*\/?>/i);
  const pages = parts.map((p) => p.trim()).filter((p, i) => p || i === 0);
  return pages.length ? pages : [""];
}

/** ตัวอักษรล้วนไว้เช็คว่าว่างไหม และใช้เป็นชื่อดีลตอนลูกค้ายอมรับ */
export function htmlToText(html: string) {
  if (typeof document === "undefined") {
    return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const el = document.createElement("div");
  el.innerHTML = String(html || "");
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** บรรทัดแรกที่มีตัวอักษร ใช้ตั้งชื่อดีลและใบงาน */
export function firstLine(html: string) {
  const text = htmlToText(html);
  return text.split(/\s{2,}|·/)[0]?.slice(0, 120) || text.slice(0, 120);
}

/*
 * ตัดหน้าอัตโนมัติ (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * แตกรายละเอียดเป็น "ก้อน" ที่ตัดข้ามหน้าได้ — ย่อหน้า · ข้อในรายการ · แถวตาราง
 * หน้ากระดาษวัดความสูงก้อนจริงแล้วจัดลงแผ่น A4 (quotation-paper.tsx)
 */

export type PageUnit = {
  /** HTML ของก้อน มี data-u=ลำดับ ไว้หาตอนวัดความสูง */
  html: string;
  /** ก้อนที่อยู่ในรายการ/ตารางเดียวกัน ต้องห่อด้วยแท็กแม่ตอนประกอบหน้า */
  group?: { key: number; tag: "ul" | "ol" | "table"; head: string };
  /** ลำดับข้อของ ol — ตัดข้ามหน้าแล้วเลขข้อยังต่อกัน */
  n?: number;
};

const INLINE = new Set(["B", "STRONG", "I", "EM", "U", "SPAN", "A", "BR", "FONT", "S", "SUB", "SUP", "SMALL", "CODE", "MARK"]);

/** แตก HTML เป็นก้อน แยกตามจุดแบ่งหน้าที่ผู้ใช้แทรก (<hr>) — sections = ลำดับก้อนของแต่ละช่วง */
export function pageModel(html: string): { units: PageUnit[]; sections: number[][] } {
  const units: PageUnit[] = [];
  const sections: number[][] = [];
  if (typeof document === "undefined") return { units, sections: [[]] };
  let key = 0;

  const push = (el: Element, extra?: Omit<PageUnit, "html">) => {
    el.setAttribute("data-u", String(units.length));
    units.push({ html: el.outerHTML, ...extra });
    return units.length - 1;
  };

  for (const part of splitPages(html)) {
    const sec: number[] = [];
    const root = document.createElement("div");
    root.innerHTML = part;
    let run: Node[] = [];
    const flush = () => {
      if (!run.length) return;
      const p = document.createElement("p");
      run.forEach((n) => p.appendChild(n.cloneNode(true)));
      run = [];
      if ((p.textContent ?? "").trim() || p.querySelector("br")) sec.push(push(p));
    };

    root.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && INLINE.has((node as Element).tagName))) {
        run.push(node);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      flush();
      const el = node as Element;
      const tag = el.tagName;
      if (tag === "UL" || tag === "OL") {
        const g = { key: ++key, tag: tag.toLowerCase() as "ul" | "ol", head: "" };
        Array.from(el.children).forEach((li, i) =>
          sec.push(push(li.cloneNode(true) as Element, { group: g, n: i + 1 })),
        );
        return;
      }
      if (tag === "TABLE") {
        const t = el as HTMLTableElement;
        const rows = Array.from(t.rows).filter((r) => r.parentElement?.tagName !== "THEAD");
        if (!rows.length) {
          sec.push(push(el.cloneNode(true) as Element));
          return;
        }
        const g = { key: ++key, tag: "table" as const, head: t.tHead?.outerHTML ?? "" };
        rows.forEach((r) => sec.push(push(r.cloneNode(true) as Element, { group: g })));
        return;
      }
      sec.push(push(el.cloneNode(true) as Element));
    });
    flush();
    sections.push(sec);
  }
  return { units, sections: sections.length ? sections : [[]] };
}

/** ประกอบก้อนที่เลือกกลับเป็น HTML ของหนึ่งหน้า — ห่อรายการ/ตารางที่ตัดข้ามหน้าใหม่ หัวตารางซ้ำทุกหน้า */
export function buildPage(units: PageUnit[], idx: number[]) {
  let out = "";
  let open: PageUnit["group"];
  const close = (g: NonNullable<PageUnit["group"]>) => (g.tag === "table" ? "</tbody></table>" : `</${g.tag}>`);
  for (const i of idx) {
    const u = units[i];
    if (!u) continue;
    const g = u.group;
    if (open && (!g || g.key !== open.key)) {
      out += close(open);
      open = undefined;
    }
    if (g && !open) {
      out +=
        g.tag === "table"
          ? `<table data-g="${g.key}">${g.head}<tbody>`
          : g.tag === "ol"
            ? `<ol start="${u.n ?? 1}">`
            : "<ul>";
      open = g;
    }
    out += u.html;
  }
  if (open) out += close(open);
  return out;
}
