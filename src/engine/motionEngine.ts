import { FallbackKind, Palette, SceneSpec, ShowreelData, TransitionKind } from '../types/showreel';

export interface ScenePaintContext {
  pal: Palette;
  bpm: number;
  energy: number;
  text: string;
  sub: string;
  role: string;
  dur: number;
  seed: number;
  pulse: number;
  gt: number;
  i: number;
}

export type SceneDrawFn = (
  ctx: CanvasRenderingContext2D,
  t: number,
  ts: number,
  W: number,
  H: number,
  P: ScenePaintContext,
  M: typeof MotionLib
) => void;

export const MotionLib = {
  clamp: (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
  lerp: (a: number, b: number, t: number) => a + (b - a) * t,
  map: (x: number, a: number, b: number, c: number, d: number) =>
    c + (d - c) * MotionLib.clamp((x - a) / (b - a)),
  p: (ts: number, start: number, dur: number) => MotionLib.clamp((ts - start) / dur),
  stagger: (ts: number, i: number, start: number, gap: number, dur: number) =>
    MotionLib.p(ts, start + i * gap, dur),
  ease: {
    outExpo: (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    outCubic: (x: number) => 1 - Math.pow(1 - x, 3),
    inCubic: (x: number) => x * x * x,
    inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    inOutQuint: (x: number) =>
      x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2,
    outBack: (x: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    },
    outElastic: (x: number) =>
      x <= 0
        ? 0
        : x >= 1
        ? 1
        : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  },
  spring: (x: number, k = 7, w = 14) => {
    const cx = MotionLib.clamp(x);
    return 1 - Math.exp(-k * cx) * Math.cos(w * cx);
  },
  rgb: (h: string): [number, number, number] => {
    let hex = String(h || '#ffffff').replace('#', '');
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const n = parseInt(hex, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  col: (h: string, a = 1) => {
    const c = MotionLib.rgb(h);
    return `rgba(${c[0]},${c[1]},${c[2]},${MotionLib.clamp(a)})`;
  },
  mixc: (h1: string, h2: string, t: number) => {
    const a = MotionLib.rgb(h1);
    const b = MotionLib.rgb(h2);
    const ct = MotionLib.clamp(t);
    return `rgb(${Math.round(MotionLib.lerp(a[0], b[0], ct))},${Math.round(
      MotionLib.lerp(a[1], b[1], ct)
    )},${Math.round(MotionLib.lerp(a[2], b[2], ct))})`;
  },
  rng: (seed: number) => {
    let a = seed | 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  lines: (s: string, max = 11): string[] => {
    const w = String(s).split(/\s+/).filter(Boolean);
    const L: string[] = [];
    let cur = '';
    w.forEach((x) => {
      if (cur && (cur + ' ' + x).length > max) {
        L.push(cur);
        cur = x;
      } else {
        cur = (cur ? cur + ' ' : '') + x;
      }
    });
    if (cur) L.push(cur);
    return L.slice(0, 4).length ? L.slice(0, 4) : [''];
  },
  fit: (
    ctx: CanvasRenderingContext2D,
    s: string,
    maxW: number,
    size: number,
    weight?: number | string
  ) => {
    ctx.save();
    let sz = Math.round(size);
    while (sz > 12) {
      ctx.font = `${weight || 800} ${sz}px 'Outfit', system-ui, Roboto, Arial, sans-serif`;
      if (ctx.measureText(s).width <= maxW) break;
      sz -= 4;
    }
    ctx.restore();
    return sz;
  },
  text: (
    ctx: CanvasRenderingContext2D,
    s: string,
    x: number,
    y: number,
    size: number,
    o: {
      alpha?: number;
      weight?: number | string;
      font?: string;
      align?: CanvasTextAlign;
      spacing?: number;
      rot?: number;
      shadow?: boolean;
      stroke?: string;
      strokeW?: number;
      color?: string;
      glow?: string;
    } = {}
  ) => {
    ctx.save();
    ctx.globalAlpha = o.alpha === undefined ? 1 : MotionLib.clamp(o.alpha);
    ctx.font = `${o.weight || 800} ${Math.round(size)}px ${
      o.font || "'Outfit', system-ui, Roboto, Arial, sans-serif"
    }`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx && o.spacing) {
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${o.spacing}px`;
    }
    let dx = x;
    let dy = y;
    if (o.rot) {
      ctx.translate(x, y);
      ctx.rotate(o.rot);
      dx = 0;
      dy = 0;
    }
    if (o.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillText(s, dx + size * 0.03, dy + size * 0.03);
    }
    if (o.stroke) {
      ctx.lineWidth = o.strokeW || size * 0.04;
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(s, dx, dy);
    }
    ctx.fillStyle = o.color || '#fff';
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = size * 0.4;
    }
    ctx.fillText(s, dx, dy);
    ctx.restore();
  },
  rot3: (p: [number, number, number], ax: number, ay: number, az: number): [number, number, number] => {
    let x = p[0];
    let y = p[1];
    let z = p[2];
    let c = Math.cos(ax);
    let s = Math.sin(ax);
    let t = y * c - z * s;
    z = y * s + z * c;
    y = t;
    c = Math.cos(ay);
    s = Math.sin(ay);
    t = x * c + z * s;
    z = -x * s + z * c;
    x = t;
    c = Math.cos(az);
    s = Math.sin(az);
    t = x * c - y * s;
    y = x * s + y * c;
    x = t;
    return [x, y, z];
  },
  proj: (
    p: [number, number, number],
    W: number,
    H: number,
    fov = 900,
    cx = W / 2,
    cy = H / 2
  ) => {
    const s = fov / Math.max(60, fov + p[2]);
    return { x: cx + p[0] * s, y: cy + p[1] * s, s };
  },
  bg: (ctx: CanvasRenderingContext2D, W: number, H: number, P: ScenePaintContext, v = 0) => {
    const g =
      v % 2
        ? ctx.createLinearGradient(W, 0, 0, H)
        : ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, P.pal.bg1);
    g.addColorStop(1, P.pal.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const r = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  },
  deco: (ctx: CanvasRenderingContext2D, W: number, H: number, P: ScenePaintContext, ts: number) => {
    const R = MotionLib.rng(P.seed * 7 + 1);
    for (let k = 0; k < 26; k++) {
      const x = R() * W;
      const y = R() * H;
      const r = 2 + R() * 4;
      const vx = (R() - 0.5) * 80;
      const vy = -10 - R() * 50;
      const px = (((x + vx * ts) % W) + W) % W;
      const py = (((y + vy * ts) % H) + H) % H;
      ctx.fillStyle = MotionLib.col(k % 2 ? P.pal.acc : P.pal.acc2, 0.45);
      ctx.beginPath();
      ctx.arc(px, py, r * (1 + P.pulse * 0.6), 0, 7);
      ctx.fill();
    }
    const m = W * 0.06;
    const L = W * 0.08 * MotionLib.ease.outExpo(MotionLib.p(ts, 0, 0.5));
    ctx.strokeStyle = MotionLib.col(P.pal.dim, 0.6);
    ctx.lineWidth = 3;
    ctx.beginPath();
    [
      [m, m, 1, 1],
      [W - m, m, -1, 1],
      [m, H - m, 1, -1],
      [W - m, H - m, -1, -1],
    ].forEach((c) => {
      ctx.moveTo(c[0] + c[2] * L, c[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0], c[1] + c[3] * L);
    });
    ctx.stroke();
  },
  mainText: (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    P: ScenePaintContext,
    _ts: number,
    o: { scale?: number; cy?: number; alpha?: number } = {}
  ) => {
    const L = MotionLib.lines(String(P.text).toUpperCase(), 11);
    const long = L.reduce((a, b) => (a.length > b.length ? a : b), '');
    const fs = MotionLib.fit(ctx, long, W * 0.84, W * 0.17) * (o.scale || 1);
    const lh = fs * 1.18;
    const cy = o.cy || H * 0.46;
    const y0 = cy - ((L.length - 1) * lh) / 2;
    L.forEach((l, i) =>
      MotionLib.text(ctx, l, W / 2, y0 + i * lh, fs * (1 + P.pulse * 0.05), {
        color: i === L.length - 1 && L.length > 1 ? P.pal.acc : P.pal.fg,
        alpha: o.alpha === undefined ? 1 : o.alpha,
        glow: P.pal.acc,
      })
    );
  },
  sub: (ctx: CanvasRenderingContext2D, W: number, H: number, P: ScenePaintContext, ts: number) => {
    const s = String(P.sub || '').trim();
    if (!s) return;
    const a = MotionLib.p(ts, 0.55, 0.35);
    if (a <= 0) return;
    const sz = MotionLib.fit(ctx, s, W * 0.86, W * 0.045, 600);
    MotionLib.text(ctx, s, W / 2, H * 0.8 + (1 - a) * 20, sz, {
      color: P.pal.dim,
      alpha: a,
      weight: 600,
    });
  },
};

export const FallbackEngines: Record<FallbackKind, SceneDrawFn> = {
  kinetic: (ctx, _t, ts, W, H, P, M) => {
    M.deco(ctx, W, H, P, ts);
    const R = M.rng(P.seed);
    const dir = R() < 0.5 ? -1 : 1;
    const L = M.lines(String(P.text).toUpperCase(), 11);
    const long = L.reduce((a, b) => (a.length > b.length ? a : b), '');
    const fs = M.fit(ctx, long, W * 0.84, W * 0.2);
    const lh = fs * 1.18;
    const y0 = H * 0.46 - ((L.length - 1) * lh) / 2;
    L.forEach((l, i) => {
      const p = M.p(ts, 0.08 + i * 0.13, 0.5);
      const e = M.ease.outBack(p);
      M.text(
        ctx,
        l,
        W / 2 + (1 - M.ease.outCubic(p)) * dir * W * 0.3,
        y0 + i * lh + (1 - e) * lh * 0.5,
        fs * (0.6 + 0.4 * e) * (1 + P.pulse * 0.05),
        {
          color: i === L.length - 1 && L.length > 1 ? P.pal.acc : P.pal.fg,
          alpha: p * 2.5,
          glow: P.pal.acc,
        }
      );
    });
    const bw = W * 0.5 * M.ease.outExpo(M.p(ts, 0.5, 0.5));
    const y = y0 + (L.length - 1) * lh + fs * 0.78;
    ctx.fillStyle = P.pal.acc2;
    ctx.fillRect(W / 2 - bw / 2, y, bw, Math.max(4, W * 0.009));
  },
  burst: (ctx, _t, ts, W, H, P, M) => {
    const R = M.rng(P.seed);
    const cx = W / 2;
    const cy = H * 0.46;
    const g = M.ease.outExpo(M.p(ts, 0, 0.9));
    const n = 24 + Math.floor(R() * 16);
    const spin = (R() - 0.5) * 1.4;
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n + ts * spin;
      const ln = 0.45 + R() * 0.55;
      const r0 = W * (0.16 + P.pulse * 0.03);
      const r1 = W * (0.18 + 0.55 * g * ln);
      ctx.strokeStyle = M.col(k % 2 ? P.pal.acc : P.pal.acc2, 0.4 + 0.6 * g);
      ctx.lineWidth = 3 + (k % 3) * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, {
      scale: 0.7 + 0.3 * M.ease.outBack(M.p(ts, 0.1, 0.5)),
      alpha: M.p(ts, 0.05, 0.3),
    });
  },
  tunnel: (ctx, _t, ts, W, H, P, M) => {
    const R = M.rng(P.seed);
    const cx = W / 2;
    const cy = H * 0.46;
    const round = R() < 0.5;
    const sp = 0.8 + R() * 0.6;
    for (let k = 0; k < 12; k++) {
      const z = (k / 12 + ts * 0.4 * sp) % 1;
      const s = Math.pow(z, 2.2) * W * 1.7;
      ctx.strokeStyle = M.col(k % 2 ? P.pal.acc : P.pal.acc2, z);
      ctx.lineWidth = 2 + z * 9;
      ctx.beginPath();
      if (round) ctx.arc(cx, cy, s / 2, 0, Math.PI * 2);
      else ctx.rect(cx - s / 2, cy - s / 2, s, s);
      ctx.stroke();
    }
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, {
      scale: 0.75 + 0.25 * M.ease.outExpo(M.p(ts, 0, 0.6)),
      alpha: M.p(ts, 0, 0.3),
    });
  },
  grid: (ctx, _t, ts, W, H, P, M) => {
    const R = M.rng(P.seed);
    const cols = [5, 6, 8][Math.floor(R() * 3)];
    const cs = W / cols;
    const rows = Math.ceil(H / cs);
    const ox = R() * W;
    const oy = R() * H;
    const wp = ts * 2.2 * (0.8 + R() * 0.6);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cs;
        const y = r * cs;
        const d = Math.hypot(x + cs / 2 - ox, y + cs / 2 - oy) / W;
        const glow = M.clamp(1 - Math.abs(d - wp) * 3);
        const pad = cs * (0.06 + 0.2 * (1 - glow));
        ctx.fillStyle = M.mixc(P.pal.bg2, (r + c) % 2 ? P.pal.acc : P.pal.acc2, glow);
        ctx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
      }
    }
    const a = M.p(ts, 0.3, 0.3);
    if (a > 0) {
      ctx.fillStyle = P.pal.bg1;
      ctx.fillRect(W * 0.05, H * 0.46 - W * 0.22, W * 0.9, W * 0.44);
      M.mainText(ctx, W, H, P, ts, { scale: 0.8 + 0.2 * M.ease.outBack(a), alpha: a });
    }
  },
  orbit: (ctx, _t, ts, W, H, P, M) => {
    const R = M.rng(P.seed);
    const cx = W / 2;
    const cy = H * 0.46;
    const spin = 0.4 + R() * 0.8;
    for (let ring = 0; ring < 3; ring++) {
      const r = W * (0.22 + ring * 0.13) * M.ease.outExpo(M.p(ts, 0, 0.8));
      ctx.strokeStyle = M.col(P.pal.dim, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      const n = 3 + ring * 2;
      for (let k = 0; k < n; k++) {
        const a = ts * spin * (1 + ring * 0.5) * (ring % 2 ? 1 : -1) + (Math.PI * 2 * k) / n;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        ctx.fillStyle = k % 2 ? P.pal.acc : P.pal.acc2;
        ctx.beginPath();
        ctx.arc(px, py, W * 0.016 * (1 + P.pulse * 0.3), 0, 7);
        ctx.fill();
      }
    }
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, {
      scale: 0.6 + 0.4 * M.ease.outBack(M.p(ts, 0, 0.6)),
      alpha: M.p(ts, 0, 0.3),
    });
  },
  cube: (ctx, _t, ts, W, H, P, M) => {
    const R = M.rng(P.seed);
    const cx = W / 2;
    const cy = H * 0.36;
    const s = W * 0.2 * M.ease.outBack(M.p(ts, 0, 0.7));
    const V: [number, number, number][] = [];
    for (let x = -1; x <= 1; x += 2) {
      for (let y = -1; y <= 1; y += 2) {
        for (let z = -1; z <= 1; z += 2) {
          V.push([x * s, y * s, z * s]);
        }
      }
    }
    const E = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [0, 2],
      [1, 3],
      [4, 6],
      [5, 7],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    const ax = ts * 0.9 + R() * 3;
    const ay = ts * 1.3;
    const az = ts * 0.4;
    const Q = V.map((v) => M.proj(M.rot3(v, ax, ay, az), W, H, 900, cx, cy));
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    E.forEach((e, i) => {
      ctx.strokeStyle = M.col(i % 2 ? P.pal.acc : P.pal.acc2, 0.95);
      ctx.beginPath();
      ctx.moveTo(Q[e[0]].x, Q[e[0]].y);
      ctx.lineTo(Q[e[1]].x, Q[e[1]].y);
      ctx.stroke();
    });
    Q.forEach((p) => {
      ctx.fillStyle = P.pal.fg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * p.s, 0, 7);
      ctx.fill();
    });
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, { cy: H * 0.68, scale: 0.7, alpha: M.p(ts, 0.2, 0.4) });
  },
  closing: (ctx, _t, ts, W, H, P, M) => {
    const cx = W / 2;
    const cy = H * 0.46;
    const r = W * 0.34 * M.ease.outExpo(M.p(ts, 0, 1));
    ctx.strokeStyle = M.col(P.pal.acc, 0.8);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    M.deco(ctx, W, H, P, ts);
    M.mainText(ctx, W, H, P, ts, {
      scale: 0.85 + 0.15 * M.ease.outExpo(M.p(ts, 0, 0.9)),
      alpha: M.p(ts, 0, 0.6),
    });
    const bw = W * 0.4 * M.ease.outExpo(M.p(ts, 0.4, 0.6));
    ctx.fillStyle = P.pal.acc2;
    ctx.fillRect(cx - bw / 2, cy + W * 0.2, bw, 5);
  },
};

export function compileSceneCode(code: string | null | undefined): SceneDrawFn {
  const src = String(code || '').trim();
  if (!src) throw new Error('Código vazio');
  const fn = /^(async\s+)?function\b|^\(\s*[\w\s,]*\)\s*=>/.test(src)
    ? new Function('return (' + src + ')')()
    : new Function('ctx', 't', 'ts', 'W', 'H', 'P', 'M', src);
  if (typeof fn !== 'function') throw new Error('Não é uma função válida');
  return fn as SceneDrawFn;
}

export function resetCanvasCtx(c: CanvasRenderingContext2D) {
  if (typeof (c as unknown as { reset?: () => void }).reset === 'function') {
    (c as unknown as { reset: () => void }).reset();
  } else {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.globalCompositeOperation = 'source-over';
  }
}

export function pulseAt(gt: number, bpm: number, energy: number): number {
  const f = ((gt * bpm) / 60) % 1;
  return Math.pow(1 - f, 4) * (0.35 + 0.13 * energy);
}

export function validateSceneCode(
  code: string,
  scene: SceneSpec,
  data: ShowreelData
): { valid: boolean; error?: string; avgMs?: number; fn?: SceneDrawFn } {
  try {
    const fn = compileSceneCode(code);
    const testCanvas = document.createElement('canvas');
    testCanvas.width = data.W;
    testCanvas.height = data.H;
    const ctx = testCanvas.getContext('2d');
    if (!ctx) return { valid: true, fn, avgMs: 1 };

    const t0 = performance.now();
    [0.05, 0.5, 0.95].forEach((f) => {
      const ts = scene.dur * f;
      const gt = (scene.start || 0) + ts;
      resetCanvasCtx(ctx);
      const P: ScenePaintContext = {
        pal: data.dna.pal,
        bpm: data.dna.bpm,
        energy: data.dna.energy,
        text: scene.text,
        sub: scene.sub,
        role: scene.role,
        dur: scene.dur,
        seed: scene.seed,
        pulse: pulseAt(gt, data.dna.bpm, data.dna.energy),
        gt,
        i: 0,
      };
      MotionLib.bg(ctx, data.W, data.H, P, 0);
      fn(ctx, MotionLib.clamp(ts / scene.dur), ts, data.W, data.H, P, MotionLib);
      MotionLib.sub(ctx, data.W, data.H, P, ts);
    });
    const avgMs = (performance.now() - t0) / 3;
    if (avgMs > 120) {
      return {
        valid: false,
        error: `Cena muito pesada (${Math.round(avgMs)} ms/frame > limite 120ms)`,
        avgMs,
      };
    }
    return { valid: true, fn, avgMs: Math.round(avgMs * 10) / 10 };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function compositeTransition(
  ctx: CanvasRenderingContext2D,
  co: HTMLCanvasElement,
  cn: HTMLCanvasElement,
  kind: TransitionKind,
  p: number,
  W: number,
  H: number,
  pal: Palette
) {
  resetCanvasCtx(ctx);
  const e = MotionLib.ease.inOutCubic(p);
  if (kind === 'wipe_h') {
    ctx.drawImage(co, 0, 0);
    const cut = Math.floor(W * e);
    if (cut >= 1) ctx.drawImage(cn, 0, 0, cut, H, 0, 0, cut, H);
    ctx.fillStyle = pal.acc;
    ctx.fillRect(cut - W * 0.03, 0, W * 0.03, H);
  } else if (kind === 'wipe_v') {
    ctx.drawImage(co, 0, 0);
    const cut = Math.floor(H * e);
    if (cut >= 1) ctx.drawImage(cn, 0, 0, W, cut, 0, 0, W, cut);
    ctx.fillStyle = pal.acc;
    ctx.fillRect(0, cut - H * 0.02, W, H * 0.02);
  } else if (kind === 'crossfade') {
    ctx.drawImage(co, 0, 0);
    ctx.globalAlpha = e;
    ctx.drawImage(cn, 0, 0);
    ctx.globalAlpha = 1;
  } else if (kind === 'zoom') {
    const s2 = 0.88 + 0.12 * e;
    ctx.drawImage(cn, (W * (1 - s2)) / 2, (H * (1 - s2)) / 2, W * s2, H * s2);
    const s1 = 1 + e * 0.7;
    ctx.globalAlpha = 1 - e;
    ctx.drawImage(co, (W * (1 - s1)) / 2, (H * (1 - s1)) / 2, W * s1, H * s1);
    ctx.globalAlpha = 1;
  } else if (kind === 'glitch') {
    ctx.drawImage(cn, 0, 0);
    const R = MotionLib.rng(Math.floor(p * 30) + 7);
    for (let k = 0; k < 10; k++) {
      const y = R() * H;
      const h = R() * H * 0.08 + 8;
      const dx = (R() - 0.5) * W * 0.3 * (1 - p);
      ctx.drawImage(cn, 0, y, W, h, dx, y, W, h);
    }
    ctx.fillStyle = MotionLib.col(pal.acc, 0.25 * (1 - p));
    ctx.fillRect(0, R() * H, W, H * 0.01);
  } else {
    ctx.drawImage(cn, 0, 0);
    ctx.fillStyle = `rgba(255,255,255,${Math.pow(1 - p, 2)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export function buildJsBundle(data: ShowreelData): string {
  const { dna } = data;
  let out = `// Showreel: ${data.title}\n`;
  if (data.prompt) out += `// Prompt: ${data.prompt}\n`;
  out += `// DNA: ${dna.estilo} | ${dna.structure} | ${dna.transition} | ${dna.bpm} bpm | energia ${dna.energy}\n`;
  out += `// Cada cena abaixo é o CORPO de uma função (ctx, t, ts, W, H, P, M)\n\n`;
  data.scenes.forEach((s, i) => {
    out += `// ===== CENA ${i + 1} [${s.role}] "${s.text}" (${s.origem}) =====\n`;
    out += `// Ideia: ${s.idea || '-'}\n`;
    out += `// Duração: ${s.dur.toFixed(1)}s | seed: ${s.seed}\n`;
    out +=
      (s.code
        ? s.code
        : `// Cena procedural integrada (fallback: ${s.fb})`) + '\n\n';
  });
  return out;
}

export function buildStandaloneHtml(data: ShowreelData): string {
  const serialized = JSON.stringify(data).replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${data.title} - Kinetix Showreel</title>
<style>
html,body{margin:0;height:100%;background:#07070b;color:#eee;font-family:system-ui,Roboto,Arial,sans-serif;overflow:hidden}
#app{display:flex;flex-direction:column;align-items:center;height:100%;padding:8px;box-sizing:border-box;gap:8px}
#top{display:flex;gap:10px;align-items:baseline;width:100%;justify-content:space-between;font-size:13px}
#top b{font-size:15px}#hud{opacity:.7}
#stage{flex:1;min-height:0;width:100%;display:flex;justify-content:center;align-items:center}
canvas{background:#000;border-radius:10px;box-shadow:0 0 40px rgba(0,0,0,.7)}
#seek{width:100%}
#bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
button{background:#1b1b28;color:#fff;border:1px solid #33334a;border-radius:10px;padding:10px 14px;font-size:15px;cursor:pointer}
button.rec{background:#e11d48;border-color:#f43f5e}
#dl a{display:inline-block;background:#12805a;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700}
details{width:100%;font-size:12px;opacity:.85}pre{white-space:pre-wrap;margin:4px 0;max-height:22vh;overflow:auto}
</style></head><body>
<div id="app">
  <div id="top"><b id="ttl"></b><span id="hud"></span></div>
  <div id="stage"><canvas id="cv"></canvas></div>
  <input type="range" id="seek" min="0" max="1000" value="0">
  <div id="bar">
    <button id="bPlay">&#9654; Play</button><button id="bRest">&#9198;</button>
    <button id="bSnd">&#128266; Som</button><button id="bRec" class="rec">&#9210; Gravar vídeo</button>
    <button id="bCode">&#128190; Salvar código</button>
  </div>
  <div id="dl"></div>
  <details><summary>Cenas / status</summary><pre id="log"></pre></details>
</div>
<script>
const D=${serialized};
const $=id=>document.getElementById(id);
const logEl=$('log');function log(m){logEl.textContent+=m+'\\n'}
const W=D.W,H=D.H,DUR=D.duration,BPM=D.dna.bpm,EN=D.dna.energy,PAL=D.dna.pal,KIND=D.dna.transition,TR=0.32;
const cv=$('cv');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
const co=document.createElement('canvas'),cn=document.createElement('canvas');
co.width=cn.width=W;co.height=cn.height=H;
const cxo=co.getContext('2d'),cxn=cn.getContext('2d');
$('ttl').textContent=D.title;
const M={};
M.clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
M.lerp=(a,b,t)=>a+(b-a)*t;
M.map=(x,a,b,c,d)=>c+(d-c)*M.clamp((x-a)/(b-a));
M.p=(ts,start,dur)=>M.clamp((ts-start)/dur);
M.stagger=(ts,i,start,gap,dur)=>M.p(ts,start+i*gap,dur);
M.ease={
  outExpo:x=>x>=1?1:1-Math.pow(2,-10*x),
  outCubic:x=>1-Math.pow(1-x,3),
  inCubic:x=>x*x*x,
  inOutCubic:x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2,
  inOutQuint:x=>x<.5?16*x*x*x*x*x:1-Math.pow(-2*x+2,5)/2,
  outBack:x=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)},
  outElastic:x=>x<=0?0:x>=1?1:Math.pow(2,-10*x)*Math.sin((x*10-.75)*(2*Math.PI/3))+1
};
M.spring=(x,k=7,w=14)=>{x=M.clamp(x);return 1-Math.exp(-k*x)*Math.cos(w*x)};
M.rgb=h=>{h=String(h).replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255]};
M.col=(h,a=1)=>{const c=M.rgb(h);return 'rgba('+c[0]+','+c[1]+','+c[2]+','+M.clamp(a)+')'};
M.mixc=(h1,h2,t)=>{const a=M.rgb(h1),b=M.rgb(h2);t=M.clamp(t);return 'rgb('+Math.round(M.lerp(a[0],b[0],t))+','+Math.round(M.lerp(a[1],b[1],t))+','+Math.round(M.lerp(a[2],b[2],t))+')'};
M.rng=seed=>{let a=(seed|0)||1;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
M.lines=(s,max=11)=>{const w=String(s).split(/\\s+/).filter(Boolean),L=[];let cur='';
  w.forEach(x=>{if(cur&&(cur+' '+x).length>max){L.push(cur);cur=x}else cur=(cur?cur+' ':'')+x});
  if(cur)L.push(cur);return L.slice(0,4).length?L.slice(0,4):['']};
M.fit=(ctx,s,maxW,size,weight)=>{ctx.save();size=Math.round(size);
  while(size>12){ctx.font=(weight||800)+' '+size+'px system-ui,Roboto,Arial,sans-serif';if(ctx.measureText(s).width<=maxW)break;size-=4}
  ctx.restore();return size};
M.text=(ctx,s,x,y,size,o={})=>{
  ctx.save();ctx.globalAlpha=o.alpha===undefined?1:M.clamp(o.alpha);
  ctx.font=(o.weight||800)+' '+Math.round(size)+'px '+(o.font||'system-ui,Roboto,Arial,sans-serif');
  ctx.textAlign=o.align||'center';ctx.textBaseline='middle';
  if('letterSpacing' in ctx&&o.spacing)ctx.letterSpacing=o.spacing+'px';
  if(o.rot){ctx.translate(x,y);ctx.rotate(o.rot);x=0;y=0}
  if(o.shadow!==false){ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillText(s,x+size*.03,y+size*.03)}
  if(o.stroke){ctx.lineWidth=o.strokeW||size*.04;ctx.strokeStyle=o.stroke;ctx.strokeText(s,x,y)}
  ctx.fillStyle=o.color||'#fff';
  if(o.glow){ctx.shadowColor=o.glow;ctx.shadowBlur=size*.4}
  ctx.fillText(s,x,y);ctx.restore()};
M.rot3=(p,ax,ay,az)=>{let x=p[0],y=p[1],z=p[2],c=Math.cos(ax),s=Math.sin(ax),t;
  t=y*c-z*s;z=y*s+z*c;y=t;c=Math.cos(ay);s=Math.sin(ay);t=x*c+z*s;z=-x*s+z*c;x=t;
  c=Math.cos(az);s=Math.sin(az);t=x*c-y*s;y=x*s+y*c;x=t;return[x,y,z]};
M.proj=(p,W,H,fov=900,cx=W/2,cy=H/2)=>{const s=fov/Math.max(60,fov+p[2]);return{x:cx+p[0]*s,y:cy+p[1]*s,s:s}};
M.bg=(ctx,W,H,P,v=0)=>{
  const g=v%2?ctx.createLinearGradient(W,0,0,H):ctx.createLinearGradient(0,0,W*.3,H);
  g.addColorStop(0,P.pal.bg1);g.addColorStop(1,P.pal.bg2);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const r=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.75);
  r.addColorStop(0,'rgba(0,0,0,0)');r.addColorStop(1,'rgba(0,0,0,.55)');ctx.fillStyle=r;ctx.fillRect(0,0,W,H)};
M.deco=(ctx,W,H,P,ts)=>{const R=M.rng(P.seed*7+1);
  for(let k=0;k<26;k++){const x=R()*W,y=R()*H,r=2+R()*4,vx=(R()-.5)*80,vy=-10-R()*50;
    const px=((x+vx*ts)%W+W)%W,py=((y+vy*ts)%H+H)%H;
    ctx.fillStyle=M.col(k%2?P.pal.acc:P.pal.acc2,.45);ctx.beginPath();ctx.arc(px,py,r*(1+P.pulse*.6),0,7);ctx.fill()}
  const m=W*.06,L=W*.08*M.ease.outExpo(M.p(ts,0,.5));
  ctx.strokeStyle=M.col(P.pal.dim,.6);ctx.lineWidth=3;ctx.beginPath();
  [[m,m,1,1],[W-m,m,-1,1],[m,H-m,1,-1],[W-m,H-m,-1,-1]].forEach(c=>{ctx.moveTo(c[0]+c[2]*L,c[1]);ctx.lineTo(c[0],c[1]);ctx.lineTo(c[0],c[1]+c[3]*L)});
  ctx.stroke()};
M.mainText=(ctx,W,H,P,ts,o={})=>{
  const L=M.lines(String(P.text).toUpperCase(),11),long=L.reduce((a,b)=>a.length>b.length?a:b,'');
  const fs=M.fit(ctx,long,W*.84,W*.17)*(o.scale||1),lh=fs*1.18,cy=o.cy||H*.46,y0=cy-(L.length-1)*lh/2;
  L.forEach((l,i)=>M.text(ctx,l,W/2,y0+i*lh,fs*(1+P.pulse*.05),
    {color:(i===L.length-1&&L.length>1)?P.pal.acc:P.pal.fg,alpha:o.alpha===undefined?1:o.alpha,glow:P.pal.acc}))};
M.sub=(ctx,W,H,P,ts)=>{const s=String(P.sub||'').trim();if(!s)return;const a=M.p(ts,.55,.35);if(a<=0)return;
  const sz=M.fit(ctx,s,W*.86,W*.045,600);M.text(ctx,s,W/2,H*.8+(1-a)*20,sz,{color:P.pal.dim,alpha:a,weight:600})};
const FB={};
FB.kinetic=(ctx,t,ts,W,H,P,M)=>{M.deco(ctx,W,H,P,ts);const R=M.rng(P.seed),dir=R()<.5?-1:1;
  const L=M.lines(String(P.text).toUpperCase(),11),long=L.reduce((a,b)=>a.length>b.length?a:b,'');
  const fs=M.fit(ctx,long,W*.84,W*.2),lh=fs*1.18,y0=H*.46-(L.length-1)*lh/2;
  L.forEach((l,i)=>{const p=M.p(ts,.08+i*.13,.5),e=M.ease.outBack(p);
    M.text(ctx,l,W/2+(1-M.ease.outCubic(p))*dir*W*.3,y0+i*lh+(1-e)*lh*.5,fs*(.6+.4*e)*(1+P.pulse*.05),
      {color:(i===L.length-1&&L.length>1)?P.pal.acc:P.pal.fg,alpha:p*2.5,glow:P.pal.acc})});
  const bw=W*.5*M.ease.outExpo(M.p(ts,.5,.5)),y=y0+(L.length-1)*lh+fs*.78;
  ctx.fillStyle=P.pal.acc2;ctx.fillRect(W/2-bw/2,y,bw,Math.max(4,W*.009))};
FB.burst=(ctx,t,ts,W,H,P,M)=>{const R=M.rng(P.seed),cx=W/2,cy=H*.46,g=M.ease.outExpo(M.p(ts,0,.9)),n=24+Math.floor(R()*16),spin=(R()-.5)*1.4;
  ctx.lineCap='round';
  for(let k=0;k<n;k++){const a=Math.PI*2*k/n+ts*spin,ln=.45+R()*.55,r0=W*(.16+P.pulse*.03),r1=W*(.18+.55*g*ln);
    ctx.strokeStyle=M.col(k%2?P.pal.acc:P.pal.acc2,.4+.6*g);ctx.lineWidth=3+(k%3)*2;ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);ctx.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);ctx.stroke()}
  M.deco(ctx,W,H,P,ts);M.mainText(ctx,W,H,P,ts,{scale:.7+.3*M.ease.outBack(M.p(ts,.1,.5)),alpha:M.p(ts,.05,.3)})};
FB.tunnel=(ctx,t,ts,W,H,P,M)=>{const R=M.rng(P.seed),cx=W/2,cy=H*.46,round=R()<.5,sp=.8+R()*.6;
  for(let k=0;k<12;k++){const z=(k/12+ts*.4*sp)%1,s=Math.pow(z,2.2)*W*1.7;
    ctx.strokeStyle=M.col(k%2?P.pal.acc:P.pal.acc2,z);ctx.lineWidth=2+z*9;ctx.beginPath();
    if(round)ctx.arc(cx,cy,s/2,0,Math.PI*2);else ctx.rect(cx-s/2,cy-s/2,s,s);ctx.stroke()}
  M.deco(ctx,W,H,P,ts);M.mainText(ctx,W,H,P,ts,{scale:.75+.25*M.ease.outExpo(M.p(ts,0,.6)),alpha:M.p(ts,0,.3)})};
FB.grid=(ctx,t,ts,W,H,P,M)=>{const R=M.rng(P.seed),cols=[5,6,8][Math.floor(R()*3)],cs=W/cols,rows=Math.ceil(H/cs),ox=R()*W,oy=R()*H,wp=ts*2.2*(.8+R()*.6);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const x=c*cs,y=r*cs,d=Math.hypot(x+cs/2-ox,y+cs/2-oy)/W,glow=M.clamp(1-Math.abs(d-wp)*3),pad=cs*(.06+.2*(1-glow));
    ctx.fillStyle=M.mixc(P.pal.bg2,(r+c)%2?P.pal.acc:P.pal.acc2,glow);ctx.fillRect(x+pad,y+pad,cs-pad*2,cs-pad*2)}
  const a=M.p(ts,.3,.3);
  if(a>0){ctx.fillStyle=P.pal.bg1;ctx.fillRect(W*.05,H*.46-W*.22,W*.9,W*.44);
    M.mainText(ctx,W,H,P,ts,{scale:.8+.2*M.ease.outBack(a),alpha:a})}};
FB.orbit=(ctx,t,ts,W,H,P,M)=>{const R=M.rng(P.seed),cx=W/2,cy=H*.46,spin=.4+R()*.8;
  for(let ring=0;ring<3;ring++){const r=W*(.22+ring*.13)*M.ease.outExpo(M.p(ts,0,.8));
    ctx.strokeStyle=M.col(P.pal.dim,.35);ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
    const n=3+ring*2;
    for(let k=0;k<n;k++){const a=ts*spin*(1+ring*.5)*(ring%2?1:-1)+Math.PI*2*k/n,px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;
      ctx.fillStyle=k%2?P.pal.acc:P.pal.acc2;ctx.beginPath();ctx.arc(px,py,W*.016*(1+P.pulse*.3),0,7);ctx.fill()}}
  M.deco(ctx,W,H,P,ts);M.mainText(ctx,W,H,P,ts,{scale:.6+.4*M.ease.outBack(M.p(ts,0,.6)),alpha:M.p(ts,0,.3)})};
FB.cube=(ctx,t,ts,W,H,P,M)=>{const R=M.rng(P.seed),cx=W/2,cy=H*.36,s=W*.2*M.ease.outBack(M.p(ts,0,.7)),V=[];
  for(let x=-1;x<=1;x+=2)for(let y=-1;y<=1;y+=2)for(let z=-1;z<=1;z+=2)V.push([x*s,y*s,z*s]);
  const E=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const ax=ts*.9+R()*3,ay=ts*1.3,az=ts*.4,Q=V.map(v=>M.proj(M.rot3(v,ax,ay,az),W,H,900,cx,cy));
  ctx.lineWidth=5;ctx.lineCap='round';
  E.forEach((e,i)=>{ctx.strokeStyle=M.col(i%2?P.pal.acc:P.pal.acc2,.95);ctx.beginPath();ctx.moveTo(Q[e[0]].x,Q[e[0]].y);ctx.lineTo(Q[e[1]].x,Q[e[1]].y);ctx.stroke()});
  Q.forEach(p=>{ctx.fillStyle=P.pal.fg;ctx.beginPath();ctx.arc(p.x,p.y,6*p.s,0,7);ctx.fill()});
  M.deco(ctx,W,H,P,ts);M.mainText(ctx,W,H,P,ts,{cy:H*.68,scale:.7,alpha:M.p(ts,.2,.4)})};
FB.closing=(ctx,t,ts,W,H,P,M)=>{const cx=W/2,cy=H*.46,r=W*.34*M.ease.outExpo(M.p(ts,0,1));
  ctx.strokeStyle=M.col(P.pal.acc,.8);ctx.lineWidth=4;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  M.deco(ctx,W,H,P,ts);M.mainText(ctx,W,H,P,ts,{scale:.85+.15*M.ease.outExpo(M.p(ts,0,.9)),alpha:M.p(ts,0,.6)});
  const bw=W*.4*M.ease.outExpo(M.p(ts,.4,.6));ctx.fillStyle=P.pal.acc2;ctx.fillRect(cx-bw/2,cy+W*.2,bw,5)};
function compile(code){
  const src=String(code||'').trim();if(!src)throw new Error('código vazio');
  const fn=/^(async\\s+)?function\\b|^\\(\\s*[\\w\\s,]*\\)\\s*=>/.test(src)?new Function('return ('+src+')')():new Function('ctx','t','ts','W','H','P','M',src);
  if(typeof fn!=='function')throw new Error('não é função');return fn}
const SC=D.scenes.map((s,i)=>{let fn=null,origem='fallback';
  if(s.code){try{fn=compile(s.code);origem=s.origem||'gemini'}catch(e){fn=null;log('cena '+(i+1)+': erro de sintaxe -> fallback ('+e.message+')')}}
  if(!fn)fn=FB[s.fb]||FB.kinetic;
  return Object.assign({},s,{fn:fn,origem:origem,start:0})});
let _acc=0;SC.forEach(s=>{s.start=_acc;_acc+=s.dur});
function degrade(i,e){const s=SC[i];log('cena '+(i+1)+': '+(e&&e.message||e)+' -> fallback');s.fn=FB[s.fb]||FB.kinetic;s.origem='fallback'}
function pulseAt(gt){const f=(gt*BPM/60)%1;return Math.pow(1-f,4)*(.35+.13*EN)}
function resetCtx(c){if(c.reset)c.reset();else{c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.shadowBlur=0;c.globalCompositeOperation='source-over'}}
function paint(c,i,ts,gt,strict){
  const s=SC[i];resetCtx(c);
  const P={pal:PAL,bpm:BPM,energy:EN,text:s.text,sub:s.sub,role:s.role,dur:s.dur,seed:s.seed,pulse:pulseAt(gt),gt:gt,i:i};
  M.bg(c,W,H,P,i);
  try{s.fn(c,M.clamp(ts/s.dur),ts,W,H,P,M)}
  catch(e){if(strict)throw e;degrade(i,e);resetCtx(c);M.bg(c,W,H,P,i);FB[s.fb||'kinetic'](c,M.clamp(ts/s.dur),ts,W,H,P,M)}
  try{M.sub(c,W,H,P,ts)}catch(e){}
}
SC.forEach((s,i)=>{try{const t0=performance.now();
  [.05,.5,.95].forEach(f=>paint(cxn,i,s.dur*f,s.start+s.dur*f,true));
  const ms=(performance.now()-t0)/3;if(ms>120){degrade(i,{message:'muito pesada ('+Math.round(ms)+' ms/frame)'})}
}catch(e){degrade(i,e)}});
function composite(kind,p,i){
  resetCtx(ctx);const e=M.ease.inOutCubic(p);
  if(kind==='wipe_h'){ctx.drawImage(co,0,0);const cut=Math.floor(W*e);if(cut>=1)ctx.drawImage(cn,0,0,cut,H,0,0,cut,H);
    ctx.fillStyle=PAL.acc;ctx.fillRect(cut-W*.03,0,W*.03,H)}
  else if(kind==='wipe_v'){ctx.drawImage(co,0,0);const cut=Math.floor(H*e);if(cut>=1)ctx.drawImage(cn,0,0,W,cut,0,0,W,cut);
    ctx.fillStyle=PAL.acc;ctx.fillRect(0,cut-H*.02,W,H*.02)}
  else if(kind==='crossfade'){ctx.drawImage(co,0,0);ctx.globalAlpha=e;ctx.drawImage(cn,0,0);ctx.globalAlpha=1}
  else if(kind==='zoom'){const s2=.88+.12*e;ctx.drawImage(cn,W*(1-s2)/2,H*(1-s2)/2,W*s2,H*s2);
    const s1=1+e*.7;ctx.globalAlpha=1-e;ctx.drawImage(co,W*(1-s1)/2,H*(1-s1)/2,W*s1,H*s1);ctx.globalAlpha=1}
  else if(kind==='glitch'){ctx.drawImage(cn,0,0);const R=M.rng(Math.floor(p*30)+7);
    for(let k=0;k<10;k++){const y=R()*H,h=R()*H*.08+8,dx=(R()-.5)*W*.3*(1-p);ctx.drawImage(cn,0,y,W,h,dx,y,W,h)}
    ctx.fillStyle=M.col(PAL.acc,.25*(1-p));ctx.fillRect(0,R()*H,W,H*.01)}
  else{ctx.drawImage(cn,0,0);ctx.fillStyle='rgba(255,255,255,'+Math.pow(1-p,2)+')';ctx.fillRect(0,0,W,H)}
}
function frame(gt){
  gt=M.clamp(gt,0,DUR-1e-3);let i=0;while(i<SC.length-1&&gt>=SC[i+1].start)i++;
  const ts=gt-SC[i].start;
  if(i>0&&ts<TR){paint(cxn,i,ts,gt);paint(cxo,i-1,SC[i-1].dur+ts,gt);composite(KIND,ts/TR,i)}
  else paint(ctx,i,ts,gt);
  const f=gt<.4?1-gt/.4:(gt>DUR-.5?1-(DUR-gt)/.5:0);
  if(f>0){ctx.fillStyle='rgba(0,0,0,'+M.clamp(f)+')';ctx.fillRect(0,0,W,H)}
  return i}
let AC=null,master=null,adest=null,nbuf=null,muted=false;
function initAudio(){if(AC)return;
  AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=muted?0:.8;
  adest=AC.createMediaStreamDestination();master.connect(AC.destination);master.connect(adest);
  nbuf=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);const d=nbuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
function kick(){const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
  o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(40,t+.12);
  g.gain.setValueAtTime(.9,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g);g.connect(master);o.start(t);o.stop(t+.3)}
function hat(){const t=AC.currentTime,s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();
  s.buffer=nbuf;f.type='highpass';f.frequency.value=7000;g.gain.setValueAtTime(.22,t);g.gain.exponentialRampToValueAtTime(.001,t+.05);
  s.connect(f);f.connect(g);g.connect(master);s.start(t,Math.random()*.5);s.stop(t+.06)}
function whoosh(){const t=AC.currentTime,s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();
  s.buffer=nbuf;f.type='bandpass';f.frequency.setValueAtTime(400,t);f.frequency.exponentialRampToValueAtTime(3500,t+.3);
  g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(.35,t+.15);g.gain.exponentialRampToValueAtTime(.001,t+.35);
  s.connect(f);f.connect(g);g.connect(master);s.start(t);s.stop(t+.4)}
let playing=false,gt=0,t0=0,lastHalf=-1,lastScene=-1,recording=false,mr=null,chunks=[],mimeT='',wake=null;
function setPlayLabel(){$('bPlay').innerHTML=playing?'&#9208; Pausar':'&#9654; Play'}
async function keepAwake(){try{if(navigator.wakeLock)wake=await navigator.wakeLock.request('screen')}catch(e){}}
async function play(){initAudio();try{await AC.resume()}catch(e){}
  if(gt>=DUR-.02)gt=0;t0=performance.now()-gt*1000;playing=true;lastHalf=-1;setPlayLabel();keepAwake()}
function pause(){playing=false;setPlayLabel()}
function onEnd(){playing=false;setPlayLabel();if(recording)setTimeout(stopRec,500)}
function tick(){
  if(playing){gt=(performance.now()-t0)/1000;if(gt>=DUR){gt=DUR-1e-3;onEnd()}}
  const i=frame(gt);
  if(playing&&AC){const h=Math.floor(gt*BPM/60*2);if(h!==lastHalf){lastHalf=h;if(h%2===0)kick();else hat()}
    if(lastScene>=0&&i!==lastScene)whoosh()}
  lastScene=i;
  $('hud').textContent=(recording?'● GRAVANDO  ':'')+gt.toFixed(1)+'s / '+DUR+'s  ·  cena '+(i+1)+'/'+SC.length+' ('+SC[i].origem+')';
  if(playing)$('seek').value=Math.round(gt/DUR*1000);
  requestAnimationFrame(tick)}
function fitCanvas(){const st=$('stage'),r=W/H;let w=st.clientWidth,h=st.clientHeight;if(w/h>r)w=h*r;else h=w/r;cv.style.width=Math.floor(w)+'px';cv.style.height=Math.floor(h)+'px'}
addEventListener('resize',fitCanvas);
async function startRec(){
  if(recording)return;initAudio();try{await AC.resume()}catch(e){}
  const types=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  mimeT=(window.MediaRecorder&&types.find(t=>MediaRecorder.isTypeSupported(t)))||'';
  if(!mimeT){alert('Este navegador não suporta gravação. Use o Chrome atualizado.');return}
  const stream=cv.captureStream(30);adest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  chunks=[];mr=new MediaRecorder(stream,{mimeType:mimeT,videoBitsPerSecond:8000000});
  mr.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  mr.onstop=()=>{const ext=mimeT.indexOf('mp4')>=0?'mp4':'webm',blob=new Blob(chunks,{type:mimeT.split(';')[0]}),url=URL.createObjectURL(blob);
    const name='showreel_'+Date.now()+'.'+ext;$('dl').innerHTML='<a download="'+name+'" href="'+url+'">⬇ Baixar vídeo ('+ext.toUpperCase()+', '+(blob.size/1e6).toFixed(1)+' MB)</a>';
    $('dl').firstChild.click();recording=false;$('bRec').disabled=false;log('gravação pronta: '+ext)};
  recording=true;$('bRec').disabled=true;$('dl').innerHTML='';gt=0;mr.start(500);await play()}
function stopRec(){if(mr&&mr.state!=='inactive')mr.stop()}
$('bPlay').onclick=()=>playing?pause():play();
$('bRest').onclick=()=>{gt=0;if(playing)t0=performance.now();lastHalf=-1};
$('bSnd').onclick=()=>{muted=!muted;initAudio();master.gain.value=muted?0:.8;$('bSnd').innerHTML=muted?'&#128263; Mudo':'&#128266; Som'};
$('bRec').onclick=startRec;
function saveCode(){
  let out='// Showreel: '+D.title+'\\n// DNA: '+D.dna.estilo+' | '+D.dna.structure+' | '+D.dna.transition+' | '+BPM+' bpm\\n';
  out+='// Cada cena abaixo e o CORPO de uma funcao (ctx, t, ts, W, H, P, M)\\n\\n';
  SC.forEach((s,i)=>{out+='// ===== CENA '+(i+1)+' ['+s.role+'] "'+s.text+'" ('+s.origem+') =====\\n';
    out+=(s.code?s.code:'// cena pronta (fallback: '+s.fb+'), sem codigo gerado pelo Gemini')+'\\n\\n'});
  const b=new Blob([out],{type:'text/javascript'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download='showreel_codigo_'+Date.now()+'.js';
  document.body.appendChild(a);a.click();a.remove();log('código salvo (download)')}
$('bCode').onclick=saveCode;
$('seek').oninput=e=>{pause();gt=e.target.value/1000*DUR};
log('DNA: '+D.dna.structure+' | '+D.dna.transition+' | '+D.dna.estilo+' | '+BPM+' bpm | energia '+EN);
SC.forEach((s,i)=>log((i+1)+'. ['+s.role+'] '+s.text+'  ('+s.origem+', '+s.dur.toFixed(1)+'s)'));
fitCanvas();requestAnimationFrame(tick);
</script></body></html>`;
}
