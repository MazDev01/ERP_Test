"use client";

/*
 * ภาพ 3 มิติบนแผงแดงของหน้าเข้าสู่ระบบ (ตามไฟล์ตัวอย่าง login-3d-redwhite.html · เจ้าของสั่ง 24 ก.ย. 2569)
 *
 * คนครึ่งตัวยืนบนแท่น มือขวาชูแผนภูมิแท่งพร้อมลูกศรขาขึ้น มือซ้ายถือหลอดไฟ
 * และมีแดชบอร์ดโปร่งแสงลอยอยู่ข้าง ๆ ที่วาดสดด้วย canvas แล้วแปะเป็นพื้นผิว
 *
 * โหลด three แบบ dynamic ใน useEffect — ไลบรารีนี้แตะ window/WebGL จึงรันบนเซิร์ฟเวอร์ไม่ได้
 * เครื่องที่ปิด WebGL หรือผู้ใช้ที่ตั้งค่า "ลดการเคลื่อนไหว" จะไม่เห็นฉากนี้ (คืน null เงียบ ๆ)
 * หน้าเข้าสู่ระบบยังใช้งานได้ครบโดยไม่ต้องมีภาพนี้ ฟอร์มอยู่คนละชั้นกัน
 */

import { useEffect, useRef } from "react";

export function LoginScene({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = ref.current;
    if (!canvas) return;
    const el = canvas;
    /* ผู้ใช้ที่ขอลดการเคลื่อนไหว — ไม่ต้องโหลดไลบรารีเลย */
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let stop = false;
    let dispose: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      if (stop) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: true });
      } catch {
        /* เครื่องที่ปิด WebGL — ปล่อยให้แผงแดงว่าง ๆ ไป ไม่ขึ้นข้อความอะไร */
        return;
      }
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.localClippingEnabled = true;
      /* ระนาบตัดตามเส้นแบ่งแดง–ขาวบนจอ — เงาที่พื้นจะได้ไม่ล้นไปเปื้อนแผ่นขาว */
      const redClip = new THREE.Plane();
      renderer.shadowMap.type = THREE.VSMShadowMap;
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = 1.15;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      camera.position.set(0, 1.4, 10);
      camera.lookAt(0, -0.2, 0);

      /* กล่องไฟสตูดิโอที่อบเป็นแผนที่สภาพแวดล้อม — ตัวที่ทำให้ผิวดูเป็นดินเผาเงา ๆ แบบในไฟล์ */
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

      /* ไฟ — ไฟหลักจากซ้ายบนให้เงาทอดลงพื้น ไฟขอบจากขวาหลังตัดขอบให้เห็นรูปทรง */
      scene.add(new THREE.HemisphereLight(0xffffff, 0xdb0000, 0.35));
      const key = new THREE.DirectionalLight(0xfff4ea, 1.9);
      key.position.set(-3, 6, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.radius = 14;
      key.shadow.blurSamples = 20;
      key.shadow.bias = -0.0004;
      const sc = key.shadow.camera;
      sc.left = -5;
      sc.right = 5;
      sc.top = 5;
      sc.bottom = -5;
      sc.near = 1;
      sc.far = 20;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xdde6ff, 0.9);
      rim.position.set(5, 3, -4);
      scene.add(rim);

      /* ShadowMaterial ไม่รองรับระนาบตัดมาแต่เดิม ต้องต่อชิ้นส่วนเชดเดอร์ให้เอง (ตามไฟล์ตัวอย่าง) */
      const floorMat = new THREE.ShadowMaterial({ opacity: 0.32, color: 0x4a0000, clippingPlanes: [redClip] });
      const NL = String.fromCharCode(10);
      floorMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>" + NL + "#include <clipping_planes_pars_vertex>")
          .replace("#include <project_vertex>", "#include <project_vertex>" + NL + "#include <clipping_planes_vertex>");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>" + NL + "#include <clipping_planes_pars_fragment>")
          .replace("void main() {", "void main() {" + NL + "#include <clipping_planes_fragment>");
      };
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.75;
      floor.receiveShadow = true;
      scene.add(floor);

      const M = {
        clay: new THREE.MeshPhysicalMaterial({ color: 0xf3f1ef, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.22 }),
        suit: new THREE.MeshPhysicalMaterial({ color: 0x2f3338, roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x7a808a) }),
        metal: new THREE.MeshPhysicalMaterial({ color: 0xb9bcc2, roughness: 0.28, metalness: 0.92, clearcoat: 0.4 }),
        stone: new THREE.MeshPhysicalMaterial({ color: 0xd9d4d1, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
        red: new THREE.MeshPhysicalMaterial({ color: 0xdb0000, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
        skin: new THREE.MeshPhysicalMaterial({ color: 0xf1c4a6, roughness: 0.6, sheen: 0.3, sheenColor: new THREE.Color(0xffe3d2) }),
        hair: new THREE.MeshPhysicalMaterial({ color: 0x2a1c1d, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
      };

      const group = new THREE.Group();
      scene.add(group);
      const BASE = -1.3;

      const mesh = (geo: import("three").BufferGeometry, mat: import("three").Material) => {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
      };
      const capsule = (r: number, len: number, mat: import("three").Material) =>
        mesh(new THREE.CapsuleGeometry(r, len, 8, 24), mat);

      /* ── คนครึ่งตัวบนแท่นกลม หันเฉียง 45 องศาเข้าหาฝั่งฟอร์ม ── */
      const person = new THREE.Group();
      person.position.set(0, BASE, 0.2);
      person.rotation.y = Math.PI / 4;
      group.add(person);
      const stand = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 64), M.metal);
      stand.position.y = 0.04;
      person.add(stand);

      const body = new THREE.Group();
      body.position.y = 0.08;
      body.scale.setScalar(1.3);
      person.add(body);

      /* ลำตัวกลึงจากเส้นขอบ — ฐานตัดตรงตรงที่ต่อกับแท่น มนเฉพาะช่วงไหล่ */
      const tp = [new THREE.Vector2(0, 0), new THREE.Vector2(0.292, 0), new THREE.Vector2(0.3, 0.008), new THREE.Vector2(0.3, 0.755)];
      for (let q = 1; q <= 16; q++) {
        const an = (q / 16) * (Math.PI / 2);
        tp.push(new THREE.Vector2(0.3 * Math.cos(an), 0.755 + 0.3 * Math.sin(an)));
      }
      const torso = mesh(new THREE.LatheGeometry(tp, 64), M.suit);
      body.add(torso);

      const headG = new THREE.Group();
      headG.position.y = 1.35;
      body.add(headG);
      headG.add(mesh(new THREE.SphereGeometry(0.26, 40, 28), M.skin));

      /* ผม — ก้อนใหญ่คลุมท้ายทอย เปิดหน้าไว้ให้เห็นใบหน้า */
      const hairG = new THREE.Group();
      headG.add(hairG);
      const crown = mesh(new THREE.SphereGeometry(0.3, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.6), M.hair);
      crown.scale.set(1.04, 0.95, 1.08);
      crown.position.set(0, 0.035, -0.025);
      crown.rotation.x = -0.32;
      hairG.add(crown);
      const blob = (
        r: number,
        s: [number, number, number],
        p: [number, number, number],
        rot: [number, number, number] = [0, 0, 0],
      ) => {
        const m = mesh(new THREE.SphereGeometry(r, 32, 22), M.hair);
        m.scale.set(...s);
        m.position.set(...p);
        m.rotation.set(...rot);
        hairG.add(m);
      };
      blob(0.2, [1.1, 0.8, 1], [0.02, 0.2, -0.08]);              /* ก้อนบน */
      blob(0.17, [1, 1, 0.9], [0, 0.05, -0.2]);                  /* ท้ายทอย */
      blob(0.1, [0.7, 1.45, 1.1], [-0.245, 0, -0.03], [0, 0, 0.1]);   /* ข้างซ้าย */
      blob(0.1, [0.7, 1.45, 1.1], [0.245, 0, -0.03], [0, 0, -0.1]);   /* ข้างขวา */
      /* หน้าม้าแสกข้าง — ยกสูงตรงรอยแสก ปัดยาวข้ามหน้าผาก แล้วปลายม้วนลงที่ขมับอีกฝั่ง */
      blob(0.11, [1.3, 0.6, 1.0], [-0.13, 0.2, 0.1], [-0.2, 0, 0.25]);
      blob(0.16, [1.75, 0.52, 0.58], [0.02, 0.13, 0.195], [-0.38, -0.12, -0.32]);
      blob(0.09, [1.2, 0.95, 0.75], [0.2, 0.03, 0.15], [-0.2, -0.55, -0.7]);

      /* ปกเสื้อกับเนกไทสีแบรนด์ */
      const collar = mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.13, 32), M.clay);
      collar.position.y = 1.09;
      body.add(collar);
      const tie = mesh(new THREE.BoxGeometry(0.075, 0.34, 0.025), M.red);
      tie.position.set(0, 0.83, 0.275);
      tie.rotation.x = -0.22;
      body.add(tie);
      const knot = mesh(new THREE.BoxGeometry(0.09, 0.07, 0.04), M.red);
      knot.position.set(0, 1.0, 0.225);
      knot.rotation.x = -0.45;
      body.add(knot);

      /* แขนสองข้าง — ข้อศอกงอ ยกปลายแขนขึ้นระดับอก แบมือหงายรับของ */
      function bentArm(side: number) {
        const root = new THREE.Group();
        root.position.set(0.25 * side, 0.8, 0);
        root.rotation.z = 0.12 * side;
        body.add(root);
        const up = capsule(0.095, 0.27, M.suit);
        up.position.y = -0.2;
        root.add(up);
        const el = new THREE.Group();
        el.position.y = -0.4;
        el.rotation.order = "YXZ";
        el.rotation.set(-2.2, -0.35 * side, 0);
        root.add(el);
        el.add(mesh(new THREE.SphereGeometry(0.095, 28, 20), M.suit));
        const fo = capsule(0.09, 0.24, M.suit);
        fo.position.y = -0.2;
        el.add(fo);
        const cf = mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.04, 28), M.clay);
        cf.position.y = -0.36;
        el.add(cf);
        const hand = new THREE.Group();
        hand.position.y = -0.44;
        el.add(hand);
        const pm = mesh(new THREE.SphereGeometry(0.085, 28, 20), M.skin);
        pm.scale.set(1.05, 1.25, 0.42);
        hand.add(pm);
        [-0.045, -0.015, 0.015, 0.045].forEach((fx, i) => {
          const mid = i === 1 || i === 2;
          const f = capsule(0.022, 0.07 + (mid ? 0.02 : 0), M.skin);
          f.position.set(fx, -0.13 - (mid ? 0.01 : 0), 0);
          hand.add(f);
        });
        const th = capsule(0.025, 0.06, M.skin);
        th.position.set(0.095 * side, -0.02, 0.01);
        th.rotation.z = 0.9 * side;
        hand.add(th);
        return { root, elbow: el, hand };
      }
      const AL = bentArm(-1);
      const AR = bentArm(1);
      AR.elbow.rotation.y = 0.4;

      /* ── แดชบอร์ดโปร่งแสงลอยข้างตัว — วาดสดลงผ้าใบแล้วแปะเป็นพื้นผิว ── */
      const HW = 640;
      const HH = 320;
      const hc = document.createElement("canvas");
      hc.width = HW;
      hc.height = HH;
      const hx = hc.getContext("2d")!;
      const holoTex = new THREE.CanvasTexture(hc);
      holoTex.colorSpace = THREE.SRGBColorSpace;
      const holoMat = new THREE.MeshBasicMaterial({
        map: holoTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const holoG = new THREE.Group();
      holoG.rotation.set(0, -Math.PI / 4, 0);
      holoG.add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), holoMat));
      holoG.position.set(0.93, 1.25, 0);
      group.add(holoG);

      const rr = (x: number, y: number, w: number, h: number, r: number) => {
        hx.beginPath();
        hx.moveTo(x + r, y);
        hx.arcTo(x + w, y, x + w, y + h, r);
        hx.arcTo(x + w, y + h, x, y + h, r);
        hx.arcTo(x, y + h, x, y, r);
        hx.arcTo(x, y, x + w, y, r);
        hx.closePath();
      };
      function drawHolo(t: number) {
        const P = 22;
        hx.clearRect(0, 0, HW, HH);
        hx.save();
        hx.shadowColor = "rgba(255,255,255,1)";
        hx.shadowBlur = 22;
        rr(P, P, HW - 2 * P, HH - 2 * P, 22);
        hx.fillStyle = "rgba(255,240,244,0.22)";
        hx.fill();
        hx.lineWidth = 5;
        hx.strokeStyle = "rgba(255,255,255,1)";
        hx.stroke();
        hx.fillStyle = "rgba(255,255,255,0.85)";
        [0, 1, 2].forEach((i) => {
          hx.beginPath();
          hx.arc(P + 26 + i * 18, P + 26, 5, 0, Math.PI * 2);
          hx.fill();
        });
        hx.fillStyle = "rgba(255,255,255,0.55)";
        rr(P + 90, P + 20, 150, 12, 6);
        hx.fill();
        /* การ์ดตัวเลขสามใบ — ความยาวแท่งขยับเบา ๆ ให้ดูเหมือนข้อมูลเดิน */
        for (let k = 0; k < 3; k++) {
          const x = P + 20 + k * 150;
          const y = P + 52;
          rr(x, y, 134, 62, 10);
          hx.fillStyle = "rgba(255,255,255,0.10)";
          hx.fill();
          hx.strokeStyle = "rgba(255,255,255,0.5)";
          hx.lineWidth = 1.5;
          hx.stroke();
          hx.fillStyle = "rgba(255,255,255,0.9)";
          rr(x + 14, y + 14, 50 + 30 * Math.abs(Math.sin(t * 0.6 + k)), 14, 7);
          hx.fill();
          hx.fillStyle = "rgba(255,255,255,0.45)";
          rr(x + 14, y + 38, 80, 8, 4);
          hx.fill();
        }
        /* กราฟเส้นพร้อมพื้นใต้เส้น */
        const cx = P + 20;
        const cy = P + 140;
        const cw = 370;
        const ch = HH - P - cy - 18;
        hx.strokeStyle = "rgba(255,255,255,0.15)";
        hx.lineWidth = 1;
        for (let g = 0; g <= 4; g++) {
          hx.beginPath();
          hx.moveTo(cx, cy + (g * ch) / 4);
          hx.lineTo(cx + cw, cy + (g * ch) / 4);
          hx.stroke();
        }
        const pts: [number, number][] = [];
        for (let i = 0; i <= 24; i++) {
          const u = i / 24;
          pts.push([cx + u * cw, cy + ch - (0.18 + 0.62 * u) * ch - Math.sin(u * 9 + t * 1.4) * 14 - Math.sin(u * 23 + t * 2.3) * 5]);
        }
        hx.beginPath();
        hx.moveTo(pts[0][0], cy + ch);
        pts.forEach((p) => hx.lineTo(p[0], p[1]));
        hx.lineTo(cx + cw, cy + ch);
        hx.closePath();
        hx.fillStyle = "rgba(255,255,255,0.14)";
        hx.fill();
        hx.beginPath();
        pts.forEach((p, j) => (j ? hx.lineTo(p[0], p[1]) : hx.moveTo(p[0], p[1])));
        hx.strokeStyle = "rgba(255,255,255,0.95)";
        hx.lineWidth = 3;
        hx.stroke();
        const e = pts[pts.length - 1];
        hx.fillStyle = "#FFFFFF";
        hx.beginPath();
        hx.arc(e[0], e[1], 6, 0, Math.PI * 2);
        hx.fill();
        /* โดนัทกับแท่งเล็กมุมขวา */
        const dx = HW - P - 78;
        const dy = P + 128;
        const rad = 40;
        const sw = 0.58 + 0.1 * Math.sin(t * 0.8);
        hx.lineWidth = 12;
        hx.strokeStyle = "rgba(255,255,255,0.18)";
        hx.beginPath();
        hx.arc(dx, dy, rad, 0, Math.PI * 2);
        hx.stroke();
        hx.strokeStyle = "rgba(255,255,255,0.95)";
        hx.beginPath();
        hx.arc(dx, dy, rad, -Math.PI / 2, -Math.PI / 2 + sw * Math.PI * 2);
        hx.stroke();
        for (let m = 0; m < 6; m++) {
          const bh = 18 + 38 * (0.5 + 0.5 * Math.sin(t * 1.1 + m * 0.9));
          hx.fillStyle = `rgba(255,255,255,${0.45 + m * 0.08})`;
          rr(dx - 70 + m * 24, HH - P - 18 - bh * 0.8, 14, bh * 0.8, 4);
          hx.fill();
        }
        hx.restore();
        /* เส้นสแกนวิ่งลงเรื่อย ๆ ให้ดูเหมือนภาพฉาย */
        const sy = P + ((t * 70) % (HH - 2 * P));
        const sg = hx.createLinearGradient(0, sy - 14, 0, sy + 14);
        sg.addColorStop(0, "rgba(255,255,255,0)");
        sg.addColorStop(0.5, "rgba(255,255,255,0.16)");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        hx.fillStyle = sg;
        hx.fillRect(P, sy - 14, HW - 2 * P, 28);
        holoTex.needsUpdate = true;
      }
      drawHolo(0);

      /* ── แผนภูมิแท่งกับลูกศรขาขึ้น ลอยเหนือฝ่ามือขวา ── */
      function rrect(w: number, h: number, r: number) {
        const s = new THREE.Shape();
        const x = -w / 2;
        const y = -h / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y);
        s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r);
        s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h);
        s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r);
        s.quadraticCurveTo(x, y, x + r, y);
        return s;
      }
      const extrude = (shape: import("three").Shape, depth: number, bevel: number) =>
        new THREE.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelThickness: bevel,
          bevelSize: bevel,
          bevelSegments: 4,
          curveSegments: 24,
        });

      const chartG = new THREE.Group();
      person.add(chartG);
      const growth = new THREE.Group();
      chartG.add(growth);
      const bars: import("three").Mesh[] = [];
      const BARS: [number, number, import("three").Material][] = [
        [-2.0, 0.55, M.stone],
        [-1.48, 0.95, M.clay],
        [-0.96, 1.45, M.metal],
      ];
      BARS.forEach((d) => {
        const g = extrude(rrect(0.28, d[1], 0.07), 0.4, 0.03);
        g.translate(0, d[1] / 2, -0.2);
        const m = mesh(g, d[2]);
        m.position.set(d[0], BASE - 0.35, -0.75);
        growth.add(m);
        bars.push(m);
      });

      const line = new THREE.Group();
      growth.add(line);
      const Z = -0.42;
      const B0 = BASE - 0.35;
      const LIFT = 0.4;
      const T = BARS.map((d) => B0 + d[1] + 0.03);
      const raw = (
        [
          [BARS[0][0] - 0.25, B0 + 0.22],
          [BARS[0][0] + 0.02, T[0] + 0.24],
          [BARS[1][0] - 0.22, T[0] + 0.04],
          [BARS[1][0] + 0.08, T[1] + 0.28],
          [BARS[2][0] - 0.2, T[1] + 0.12],
          [BARS[2][0] + 0.06, T[2] + 0.19],
        ] as [number, number][]
      ).map((p) => new THREE.Vector3(p[0], p[1] + LIFT, Z));
      /* เส้นหักมุมมน — ต่อเส้นตรงกับโค้งสั้น ๆ ที่หัวมุมแทนการหักฉาก */
      function roundedPath(P: import("three").Vector3[], r: number) {
        const path = new THREE.CurvePath<import("three").Vector3>();
        let cur = P[0].clone();
        for (let i = 1; i < P.length - 1; i++) {
          const din = P[i].clone().sub(P[i - 1]).normalize();
          const dout = P[i + 1].clone().sub(P[i]).normalize();
          const rad = Math.min(r, P[i].distanceTo(P[i - 1]) * 0.45, P[i].distanceTo(P[i + 1]) * 0.45);
          const A = P[i].clone().addScaledVector(din, -rad);
          const B = P[i].clone().addScaledVector(dout, rad);
          path.add(new THREE.LineCurve3(cur, A));
          path.add(new THREE.QuadraticBezierCurve3(A, P[i].clone(), B));
          cur = B;
        }
        path.add(new THREE.LineCurve3(cur, P[P.length - 1].clone()));
        return path;
      }
      const tubeGeo = new THREE.TubeGeometry(roundedPath(raw, 0.12), 200, 0.045, 14, false);
      line.add(mesh(tubeGeo, M.clay));
      const cap = mesh(new THREE.SphereGeometry(0.045, 18, 12), M.clay);
      cap.position.copy(raw[0]);
      line.add(cap);
      const TUBE_COUNT = tubeGeo.index!.count;

      const tri = new THREE.Shape();
      tri.moveTo(-0.155, 0);
      tri.lineTo(0.155, 0);
      tri.lineTo(0, 0.28);
      tri.closePath();
      const triGeo = new THREE.ExtrudeGeometry(tri, {
        depth: 0.07,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.018,
        bevelSegments: 3,
      });
      triGeo.translate(0, -0.02, -0.035);
      const head = mesh(triGeo, M.clay);
      const endP = raw[raw.length - 1];
      const endDir = endP.clone().sub(raw[raw.length - 2]).normalize();
      head.position.copy(endP);
      head.rotation.z = Math.atan2(endDir.y, endDir.x) - Math.PI / 2;
      line.add(head);

      growth.position.set(1.5, 1.65, 0.6);
      chartG.scale.setScalar(0.22);
      chartG.rotation.y = -Math.PI / 4;
      const chartBase = new THREE.Vector3();
      person.updateMatrixWorld(true);
      AR.hand.getWorldPosition(chartBase);
      person.worldToLocal(chartBase);
      chartBase.y += 0.12;
      chartG.position.copy(chartBase);
      /* แผ่นแสงนุ่ม ๆ บนฝ่ามือ ให้แผนภูมิดูเหมือนถูกฉายลอยอยู่ ไม่ใช่วางทับมือ */
      {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const g = c.getContext("2d")!;
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, "rgba(255,255,255,0.9)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(0.34, 0.34),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }),
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(chartBase.x, chartBase.y - 0.09, chartBase.z);
        person.add(glow);
      }

      /* ── หลอดไฟบนฝ่ามือซ้าย — ความคิดที่กำลังติด ── */
      const bulbG = new THREE.Group();
      person.add(bulbG);
      const bulbGlass = new THREE.MeshPhysicalMaterial({
        color: 0xfff6c8,
        emissive: 0xffe27a,
        emissiveIntensity: 1.1,
        roughness: 0.12,
        clearcoat: 1,
        transparent: true,
        opacity: 0.92,
      });
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 24), bulbGlass);
      globe.position.y = 0.2;
      globe.scale.set(1, 1.08, 1);
      bulbG.add(globe);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.09, 32), bulbGlass);
      neck.position.y = 0.085;
      bulbG.add(neck);
      const capM = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, metalness: 0.9, roughness: 0.3 });
      const capB = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.075, 32), capM);
      capB.position.y = 0.005;
      bulbG.add(capB);
      [0.022, -0.004].forEach((y) => {
        const th = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.008, 10, 32), capM);
        th.rotation.x = Math.PI / 2;
        th.position.y = y;
        bulbG.add(th);
      });
      const nub = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 16, 12),
        new THREE.MeshPhysicalMaterial({ color: 0x2e2526, roughness: 0.5 }),
      );
      nub.position.y = -0.04;
      bulbG.add(nub);
      /* ไส้หลอด */
      const fil = new THREE.Mesh(
        new THREE.TorusGeometry(0.035, 0.006, 8, 24, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0xfff8e0, toneMapped: false }),
      );
      fil.position.y = 0.19;
      bulbG.add(fil);
      /* แสงฟุ้งรอบหลอด — ป้ายรูปที่หันเข้ากล้องเสมอ */
      const haloCanvas = document.createElement("canvas");
      haloCanvas.width = haloCanvas.height = 128;
      {
        const g = haloCanvas.getContext("2d")!;
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, "rgba(255,236,150,0.75)");
        gr.addColorStop(0.4, "rgba(255,226,120,0.25)");
        gr.addColorStop(1, "rgba(255,226,120,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
      }
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCanvas), transparent: true, depthWrite: false, toneMapped: false }),
      );
      halo.scale.set(0.75, 0.75, 1);
      halo.position.y = 0.2;
      bulbG.add(halo);

      const bulbLight = new THREE.PointLight(0xffe08a, 2.2, 2.2, 2);
      bulbLight.position.y = 0.2;
      bulbG.add(bulbLight);
      const bulbBase = new THREE.Vector3();
      AL.hand.getWorldPosition(bulbBase);
      person.worldToLocal(bulbBase);
      bulbBase.y += 0.1;
      bulbG.position.copy(bulbBase);

      /* ── ขนาดกับตำแหน่งตามกรอบที่วางอยู่จริง (สูตรเดียวกับไฟล์ตัวอย่าง) ── */
      const layout = { x: 0, y: 0, s: 1 };
      /* จุดหักของไฟล์ตัวอย่างคือ 640px — ต่ำกว่านั้นแถบแดงไปอยู่ด้านบนแล้วสลับฉากเป็นกระจกเงา */
      const mq = window.matchMedia("(max-width: 640px)");
      function resize() {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const DESIGN = 1080 / 640;
        camera.fov =
          !mq.matches && w / h < DESIGN
            ? (2 * Math.atan((Math.tan(Math.PI / 12) * DESIGN) / (w / h)) * 180) / Math.PI
            : 30;
        camera.updateProjectionMatrix();

        /* ระนาบที่ลากผ่านกล้องกับเส้นแบ่งแดง–ขาวบนจอ
           จอใหญ่ = เส้นตั้งตรงที่แผ่นขาวเริ่ม · จอเล็ก = เส้นนอนที่ขอบบนของแผ่นขาว */
        let aN: import("three").Vector3;
        let bN: import("three").Vector3;
        let keep: import("three").Vector3;
        if (mq.matches) {
          const yN = 1 - 2 * (290 / h);
          aN = new THREE.Vector3(-1, yN, 0.5);
          bN = new THREE.Vector3(1, yN, 0.5);
          keep = new THREE.Vector3(0, 1, 0.5);
        } else {
          const xN = 2 * 0.335 - 1;
          aN = new THREE.Vector3(xN, -1, 0.5);
          bN = new THREE.Vector3(xN, 1, 0.5);
          keep = new THREE.Vector3(-1, 0, 0.5);
        }
        camera.updateMatrixWorld();
        aN.unproject(camera);
        bN.unproject(camera);
        keep.unproject(camera);
        redClip.setFromCoplanarPoints(camera.position, aN, bN);
        if (redClip.distanceToPoint(keep) < 0) redClip.negate();

        if (mq.matches) {
          /* จอเล็ก: ใหญ่เท่าที่แถบแดงรับได้ ชิดขอบขวา แล้วถอยเข้ามาถ้ายังมีที่ว่างก่อนถึงข้อความ */
          const halfW = Math.tan(Math.PI / 12) * 10 * (w / h);
          const tagR = ((24 + 208) / w) * 2 * halfW - halfW;
          const sm = Math.min(1.1, (halfW - 0.2 - tagR) / 2.41);
          const xr = halfW - 0.2 - 0.95 * sm;
          const room = xr - 1.46 * sm - (tagR + 0.25);
          layout.x = xr - Math.max(0, Math.min(0.8, room));
          layout.y = -0.25;
          layout.s = sm;
        } else {
          layout.x = -3.3;
          layout.y = -0.55;
          layout.s = 0.92;
        }
        /* จอเล็กสลับฉากเป็นกระจกเงา คนจะได้หันหน้าเข้าหาข้อความทางซ้าย */
        const sx = mq.matches ? -layout.s : layout.s;
        group.scale.set(sx, layout.s, layout.s);
        floor.position.y = layout.y + BASE * layout.s;
      }
      mq.addEventListener("change", resize);
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      /* ── การเคลื่อนไหว ── */
      const target = { x: 0, y: 0 };
      const cur = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        target.y = (e.clientX / window.innerWidth - 0.5) * 0.35;
        target.x = (e.clientY / window.innerHeight - 0.5) * 0.15;
      };
      window.addEventListener("pointermove", onMove);

      const easeOut = (t: number) => {
        const x = Math.min(Math.max(t, 0), 1);
        return 1 - Math.pow(1 - x, 3);
      };
      const clock = new THREE.Clock();
      let raf = 0;
      function frame() {
        const t = clock.getElapsedTime();
        cur.x += (target.x - cur.x) * 0.05;
        cur.y += (target.y - cur.y) * 0.05;
        group.rotation.set(cur.x, cur.y, 0);
        group.position.set(layout.x, layout.y, 0);

        /* แท่งโตทีละแท่ง แล้วลูกศรค่อยลากเส้นตัวเองขึ้นไป */
        bars.forEach((b, i) => {
          b.scale.y = Math.max(0.001, easeOut((t - 0.2 - i * 0.25) / 1.2));
        });
        const draw = easeOut((t - 1.5) / 1.3);
        tubeGeo.setDrawRange(0, Math.floor((TUBE_COUNT * draw) / 6) * 6);
        cap.visible = draw > 0;
        head.scale.setScalar(Math.max(0.001, easeOut((draw - 0.9) / 0.1)));

        torso.scale.y = 1 + Math.sin(t * 1.3) * 0.01;
        headG.rotation.z = Math.sin(t * 0.7) * 0.025;
        headG.rotation.x = Math.sin(t * 1.4) * 0.015;
        AL.root.rotation.z = -0.12 + Math.sin(t * 1.0) * 0.015;
        AL.elbow.rotation.x = -2.2 + Math.sin(t * 1.3 + 0.5) * 0.03;
        AR.root.rotation.z = 0.12 - Math.sin(t * 1.0 + 0.8) * 0.015;
        AR.elbow.rotation.x = -2.2 + Math.sin(t * 1.1 + 1.7) * 0.025;

        drawHolo(t);
        holoMat.opacity = 0.92 + 0.08 * Math.sin(t * 17) * Math.sin(t * 5.3);
        holoG.position.y = 1.25 + Math.sin(t * 0.75) * 0.09;
        holoG.rotation.x = Math.sin(t * 0.75 + 0.9) * 0.035;
        holoG.rotation.z = Math.sin(t * 0.5) * 0.02;

        const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);
        bulbGlass.emissiveIntensity = 1.1 * pulse;
        bulbLight.intensity = 2.2 * pulse;
        halo.material.opacity = pulse;
        bulbG.position.set(bulbBase.x, bulbBase.y + Math.sin(t * 1.1 + 2.0) * 0.03, bulbBase.z);
        chartG.position.set(chartBase.x, chartBase.y + Math.sin(t * 1.2) * 0.03, chartBase.z);
        chartG.rotation.y = -Math.PI / 4 + Math.sin(t * 0.6) * 0.12;

        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      }
      frame();

      dispose = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        mq.removeEventListener("change", resize);
        window.removeEventListener("pointermove", onMove);
        renderer.dispose();
        scene.traverse((o) => {
          const m = o as import("three").Mesh;
          if (m.geometry) m.geometry.dispose();
        });
      };
    })();

    return () => {
      stop = true;
      dispose?.();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
