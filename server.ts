import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(OUTPUT_DIR)) {
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch {
    // ignore if read-only
  }
}

// ============================ CONSTANTES EXATAS DO SCRIPT PYTHON ============================
const ROLES = ['hook', 'body', 'climax', 'closing'] as const;
const FALLBACKS = ['kinetic', 'burst', 'tunnel', 'grid', 'orbit', 'cube'] as const;
const STRUCTURES = ['crescendo', 'explosao_respiro', 'uniforme'] as const;
const TRANSITIONS = ['flash', 'wipe_h', 'wipe_v', 'crossfade', 'glitch', 'zoom'] as const;
const STYLES: [string, string][] = [
  ['tipografia cinética', 'texto gigante entrando em palavras, cortes rápidos, escalas e rotações com easing forte'],
  ['glitch digital', 'fatias deslocadas, aberração cromática, scanlines, ruído, números e código'],
  ['minimalista elegante', 'muito espaço vazio, linhas finas, círculos, movimento lento e preciso, tipografia leve'],
  ['3D em perspectiva', 'objetos 3D (cubos, esferas de partículas, túneis) projetados com M.rot3 e M.proj'],
  ['grid dinâmico', 'grades, painéis, colagem de retângulos que se revelam em onda, barras e blocos'],
  ['líquido orgânico', 'blobs, ondas senoidais, metaballs falsas, curvas suaves, movimento fluido'],
  ['neon synthwave', 'linhas de horizonte, grade em perspectiva, sol, brilhos (glow), gradientes vibrantes'],
  ['blueprint técnico', 'wireframes, medidas, cruzes, linhas de cota, números pequenos, estética de engenharia'],
];

const EXCLUI = [
  'image',
  'tts',
  'live',
  'audio',
  'embedding',
  'computer',
  'robotics',
  'vision',
  'aqa',
  'learnlm',
  'gemma',
  'imagen',
  'veo',
  'dialog',
  'customtools',
  '-exp',
];

const M_API = `M (biblioteca, já existe, NÃO redefina):
 M.clamp(x,a=0,b=1) M.lerp(a,b,t) M.map(x,a,b,c,d)  M.p(ts,inicio,duração)->0..1  M.stagger(ts,i,inicio,intervalo,duração)->0..1
 M.ease.outExpo|outCubic|inCubic|inOutCubic|inOutQuint|outBack|outElastic (recebem 0..1, SEMPRE use M.p para clampar)  M.spring(x)
 M.col(hex,alpha)->'rgba()'   M.mixc(hex1,hex2,t)->'rgb()'   M.rng(seed)->função aleatória determinística (0..1)
 M.text(ctx,str,x,y,size,{color,alpha,weight,align,rot,glow,stroke,spacing,shadow:false})   M.fit(ctx,str,maxW,size)->size
 M.lines(str,maxChars)->array de linhas   M.mainText(ctx,W,H,P,ts,{scale,alpha,cy})  (desenha P.text centralizado e bonito)
 M.rot3([x,y,z],ax,ay,az)->[x,y,z]   M.proj([x,y,z],W,H,fov,cx,cy)->{x,y,s}   M.deco(ctx,W,H,P,ts) (partículas e cantos)`;

const EXEMPLO = `const R=M.rng(P.seed);
const e=M.ease.outExpo(M.p(ts,0,.8));
for(let k=0;k<14;k++){const a=k/14*Math.PI*2+ts*.5,r=W*(.15+.35*e);
  ctx.fillStyle=M.col(k%2?P.pal.acc:P.pal.acc2,.8);ctx.beginPath();
  ctx.arc(W/2+Math.cos(a)*r,H*.46+Math.sin(a)*r,10+P.pulse*8,0,7);ctx.fill();}
M.mainText(ctx,W,H,P,ts,{scale:.7+.3*M.ease.outBack(M.p(ts,.1,.5)),alpha:M.p(ts,0,.3)});`;

const PROIBIDO = [
  'fetch(',
  'XMLHttpRequest',
  'document.',
  'window.',
  'eval(',
  'import(',
  'localStorage',
  'WebSocket',
  'navigator.',
  'require(',
  'Function(',
];

// ------------------------------ utilidades ------------------------------
function hsl_hex(h: number, s: number, l: number): string {
  const hue = ((h % 1.0) + 1.0) % 1.0;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (pVal: number, qVal: number, tVal: number) => {
    let t = tVal;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return pVal + (qVal - pVal) * 6 * t;
    if (t < 1 / 2) return qVal;
    if (t < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - t) * 6;
    return pVal;
  };
  const r = Math.floor(hue2rgb(p, q, hue + 1 / 3) * 255);
  const g = Math.floor(hue2rgb(p, q, hue) * 255);
  const b = Math.floor(hue2rgb(p, q, hue - 1 / 3) * 255);
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

let memHistorico: { runs: Array<Record<string, unknown>> } = { runs: [] };
let memBiblioteca: Array<Record<string, unknown>> = [];

function ler_json<T>(nome: string, padrao: T): T {
  try {
    const p = path.join(OUTPUT_DIR, nome);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
    }
  } catch {
    // ignore
  }
  return padrao;
}

function gravar_json<T>(nome: string, dados: T): void {
  try {
    const p = path.join(OUTPUT_DIR, nome);
    fs.writeFileSync(p, JSON.stringify(dados, null, 1), 'utf-8');
  } catch {
    // ignore
  }
}

function rngChoice<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ------------------------------ DNA aleatório ------------------------------
function make_dna(runs: Array<Record<string, unknown>>) {
  const ultimos = runs.slice(-2);
  const structCand = STRUCTURES.filter((s) => !ultimos.map((r) => r.structure).includes(s));
  const structure = rngChoice(structCand.length ? structCand : STRUCTURES);

  const transCand = TRANSITIONS.filter((t) => !ultimos.map((r) => r.transition).includes(t));
  const trans = rngChoice(transCand.length ? transCand : TRANSITIONS);

  const estilosCand = STYLES.filter((s) => !ultimos.map((r) => r.estilo).includes(s[0]));
  const estilo = rngChoice(estilosCand.length ? estilosCand : STYLES);

  let hue = Math.random();
  if (runs.length > 0) {
    const lastHue = Number(runs[runs.length - 1].hue || 0);
    for (let i = 0; i < 30; i++) {
      if (Math.abs(hue - lastHue) > 0.15) break;
      hue = Math.random();
    }
  }
  const off = rngChoice([0.5, 0.12, 0.33]);
  const pal = {
    bg1: hsl_hex(hue, 0.55, 0.045),
    bg2: hsl_hex(hue + 0.05, 0.6, 0.15),
    acc: hsl_hex(hue + off, 0.9, 0.58),
    acc2: hsl_hex(hue + off / 2 + 0.08, 0.85, 0.62),
    fg: '#f5f5f5',
    dim: '#b0b0c0',
  };
  return {
    structure,
    transition: trans,
    estilo: estilo[0],
    estilo_desc: estilo[1],
    pal,
    bpm: Math.floor(90 + Math.random() * 51),
    energy: Math.floor(2 + Math.random() * 4),
    hue,
  };
}

// ------------------------------ Gemini (Chave 1 + Chave 2 + Descoberta de Modelos) ------------------------------
function extrairChaves(key1?: string, key2?: string): string[] {
  const k1 = (key1 || process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '').trim();
  const k2 = (key2 || process.env.GEMINI_API_KEY_2 || '').trim();
  const chaves: string[] = [];
  for (const k of [k1, k2]) {
    if (k && k !== 'MY_GEMINI_API_KEY' && !chaves.includes(k)) {
      chaves.push(k);
    }
  }
  return chaves;
}

const modelDiscoveryCache = new Map<string, { ts: number; models: string[] }>();

async function descobrir_modelos(chave0: string): Promise<{ models: string[]; logs: string[] }> {
  const cacheKey = chave0.slice(0, 12);
  const cached = modelDiscoveryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
    return { models: cached.models, logs: [] };
  }

  const nomes: string[] = [];
  const logs: string[] = [];
  let token = '';

  for (let page = 0; page < 5; page++) {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200' +
      (token ? `&pageToken=${encodeURIComponent(token)}` : '');
    try {
      const resp = await fetch(url, {
        headers: { 'x-goog-api-key': chave0 },
      });
      if (!resp.ok) {
        logs.push(`  (não consegui listar os modelos: HTTP ${resp.status})`);
        break;
      }
      const data = (await resp.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
        nextPageToken?: string;
      };
      for (const m of data.models || []) {
        const nome = String(m.name || '').split('/').pop() || '';
        const methods = m.supportedGenerationMethods || [];
        if (
          methods.includes('generateContent') &&
          nome.startsWith('gemini-') &&
          nome.includes('flash') &&
          !EXCLUI.some((x) => nome.includes(x))
        ) {
          nomes.push(nome);
        }
      }
      token = data.nextPageToken || '';
      if (!token) break;
    } catch (ex) {
      logs.push(`  (não consegui listar os modelos: ${ex instanceof Error ? ex.message : String(ex)})`);
      break;
    }
  }

  const unique = Array.from(new Set(nomes));
  unique.sort((a, b) => {
    const mva = a.match(/^gemini-(\d+(?:\.\d+)?)/);
    const mvb = b.match(/^gemini-(\d+(?:\.\d+)?)/);
    const vera = mva ? parseFloat(mva[1]) : 0.0;
    const verb = mvb ? parseFloat(mvb[1]) : 0.0;
    if (vera !== verb) return verb - vera; // -ver
    const liteA = a.includes('lite') ? 1 : 0;
    const liteB = b.includes('lite') ? 1 : 0;
    if (liteA !== liteB) return liteA - liteB;
    const prevA = a.includes('preview') ? 1 : 0;
    const prevB = b.includes('preview') ? 1 : 0;
    if (prevA !== prevB) return prevA - prevB;
    return a.localeCompare(b);
  });

  if (unique.length > 0) {
    modelDiscoveryCache.set(cacheKey, { ts: Date.now(), models: unique });
  }

  return { models: unique, logs };
}

async function preparar_modelos(
  chaves: string[],
  geminiModelPref = 'auto'
): Promise<{ modelos: string[]; logs: string[] }> {
  const logs: string[] = [];
  const padrao = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
  let achados: string[] = [];

  if (chaves.length > 0) {
    const disc = await descobrir_modelos(chaves[0]);
    achados = disc.models;
    logs.push(...disc.logs);
    if (achados.length > 0) {
      logs.push(`Modelos Gemini disponíveis na sua chave: ${achados.slice(0, 12).join(', ')}`);
    }
  }

  const base = achados.length > 0 ? achados.slice(0, 8) : padrao;
  let modelos: string[];
  if (geminiModelPref && geminiModelPref.toLowerCase() !== 'auto') {
    modelos = [geminiModelPref, ...base.filter((m) => m !== geminiModelPref)];
  } else {
    modelos = base;
  }
  logs.push(`Modelo em uso: ${modelos[0]} (se falhar, troca sozinho)`);
  return { modelos, logs };
}

async function geminiCall(options: {
  prompt: string;
  chaves: string[];
  modelos: string[];
  miRef: { mi: number };
  json_mode?: boolean;
  temperature?: number;
  tries?: number;
  chave?: number;
}): Promise<{ text: string | null; logs: string[] }> {
  const {
    prompt,
    chaves,
    modelos,
    miRef,
    json_mode = false,
    temperature = 0.9,
    tries = 4,
    chave = 0,
  } = options;
  const logs: string[] = [];

  if (!chaves.length || !modelos.length) {
    return { text: null, logs };
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: 8192,
      ...(json_mode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const n = chaves.length;
  let k = 0;

  while (k < tries) {
    const modelo = modelos[Math.min(miRef.mi, modelos.length - 1)];
    const idx = (chave + k) % n;
    logs.push(`    (chave ${idx + 1} de ${n}, modelo ${modelo})`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': chaves[idx],
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const msg = (await resp.text()).slice(0, 1200);
        const sem_modelo = resp.status === 404 || (resp.status === 429 && /limit:\s*0\b/.test(msg));
        if (sem_modelo && miRef.mi < modelos.length - 1) {
          miRef.mi += 1;
          logs.push(
            `  Modelo ${modelo} indisponível (${resp.status}). Trocando para ${modelos[miRef.mi]}`
          );
          continue;
        }
        if (resp.status === 429 || resp.status >= 500) {
          const troca = n > 1 && k < n - 1;
          // Se houver outra chave, troca rápido; se todos os modelos/chaves falharem, tenta próximo modelo
          if (!troca && miRef.mi < modelos.length - 1) {
            miRef.mi += 1;
            logs.push(
              `  Limite na chave ${idx + 1} para ${modelo} (429). Alternando para modelo ${modelos[miRef.mi]}...`
            );
            continue;
          }
          const espera = troca ? 1.5 : 3;
          logs.push(
            `  Chave ${idx + 1} ocupada/limite (${resp.status}). ${
              troca ? 'Trocando de chave' : 'Aguardando'
            } em ${espera}s...`
          );
          await new Promise((r) => setTimeout(r, espera * 1000));
          k += 1;
          continue;
        }
        logs.push(`  Erro Gemini (chave ${idx + 1}) ${resp.status}: ${msg.slice(0, 200)}`);
        if (n > 1 && k < n - 1) {
          k += 1;
          continue;
        }
        return { text: null, logs };
      }

      const data = (await resp.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        }>;
      };
      const parts = data.candidates?.[0]?.content?.parts || [];
      const txt = parts
        .filter((p) => !p.thought)
        .map((p) => p.text || '')
        .join('');
      if (txt.trim()) {
        return { text: txt, logs };
      }
      k += 1;
    } catch (ex) {
      logs.push(`  Erro Gemini: ${ex instanceof Error ? ex.message : String(ex)}`);
      await new Promise((r) => setTimeout(r, 1500));
      k += 1;
    }
  }

  return { text: null, logs };
}

// ------------------------------ planejamento ------------------------------
function offline_plan(user_prompt: string) {
  const words = user_prompt
    .toUpperCase()
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 12);
  if (!words.length) words.push('MOTION');
  const ideias = ['MOVIMENTO', 'RITMO', 'IMPACTO', 'DETALHE', 'ENERGIA', 'FLUXO', 'FOCO'];
  const scenes: Array<Record<string, unknown>> = [
    { role: 'hook', text: words.slice(0, 4).join(' '), sub: 'showreel', idea: '', weight: 2 },
  ];
  for (let i = 1; i < 7; i++) {
    scenes.push({
      role: i === 5 ? 'climax' : 'body',
      text: rngChoice(ideias) + (i % 2 ? ' ' + words[i % words.length] : ''),
      sub: '',
      idea: '',
      weight: rngChoice([1, 1, 2]),
    });
  }
  scenes.push({
    role: 'closing',
    text: words.slice(0, 3).join(' '),
    sub: 'obrigado',
    idea: '',
    weight: 2,
  });
  return { title: words.slice(0, 3).join(' '), scenes };
}

function clean_plan(plan: { title?: string; scenes?: Array<Record<string, unknown>> }) {
  const scenes: Array<{
    role: 'hook' | 'body' | 'climax' | 'closing';
    text: string;
    sub: string;
    idea: string;
    weight: number;
    fb: string;
  }> = [];

  for (const s of (plan.scenes || []).slice(0, 10)) {
    if (!s || typeof s !== 'object') continue;
    const r = String(s.role || 'body');
    const role = (ROLES.includes(r as typeof ROLES[number]) ? r : 'body') as
      | 'hook'
      | 'body'
      | 'climax'
      | 'closing';
    scenes.push({
      role,
      text: String(s.text || 'MOTION').slice(0, 40),
      sub: String(s.sub || '').slice(0, 60),
      idea: String(s.idea || '').slice(0, 300),
      weight: Number(s.weight) || 1,
      fb: 'kinetic',
    });
  }
  if (!scenes.length) {
    scenes.push({ role: 'hook', text: 'MOTION', sub: '', idea: '', weight: 1, fb: 'kinetic' });
  }
  if (scenes.length === 1) {
    scenes.push({ role: 'closing', text: 'FIM', sub: '', idea: '', weight: 1, fb: 'closing' });
  }
  scenes[0].role = 'hook';
  for (let i = 1; i < scenes.length - 1; i++) {
    if (scenes[i].role === 'hook' || scenes[i].role === 'closing') {
      scenes[i].role = 'body';
    }
  }
  scenes[scenes.length - 1].role = 'closing';

  let prev = '';
  for (const s of scenes) {
    if (s.role === 'closing') {
      s.fb = 'closing';
    } else {
      const op = FALLBACKS.filter((f) => f !== prev);
      s.fb = rngChoice(op.length ? op : FALLBACKS);
    }
    prev = s.fb;
  }
  return { title: String(plan.title || 'showreel').slice(0, 60), scenes };
}

function schedule(
  scenes: Array<{ weight?: number }>,
  structure: string,
  total: number
): number[] {
  const n = scenes.length;
  const ws = scenes.map((s, i) => {
    let base = 1.0;
    try {
      base = Math.max(0.5, Math.min(3.0, Number(s.weight ?? 1)));
    } catch {
      base = 1.0;
    }
    let f = 1.0;
    if (structure === 'crescendo') {
      f = 1.7 - (1.2 * i) / Math.max(1, n - 1);
    } else if (structure === 'explosao_respiro') {
      f = i % 2 ? 0.7 : 1.3;
    }
    return base * f;
  });
  const sumWs = ws.reduce((a, b) => a + b, 0) || 1;
  const durs = ws.map((w) => Math.max(1.6, (total * w) / sumWs));
  const sumDurs = durs.reduce((a, b) => a + b, 0) || 1;
  const k = total / sumDurs;
  return durs.map((d) => Math.round(d * k * 1000) / 1000);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // Render Zero-Downtime Health Check & Keep-Alive Ping
  app.get(['/healthz', '/api/ping'], (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
    });
  });

  // Endpoint 1: Descobrir modelos disponíveis na Chave 1 (exatamente como descobrir_modelos() no Python)
  app.post('/api/agent/models', async (req, res) => {
    const { key1, key2, modelPref = 'auto' } = req.body || {};
    const chaves = extrairChaves(key1, key2);
    if (!chaves.length) {
      return res.json({
        chavesCount: 0,
        modelos: ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'],
        logs: ['Modo offline (nenhuma chave informada).'],
      });
    }
    const prep = await preparar_modelos(chaves, modelPref);
    res.json({
      chavesCount: chaves.length,
      modelos: prep.modelos,
      logs: prep.logs,
    });
  });

  // Endpoint 2: Gerar Roteiro + DNA + Preparar Modelos (Passo 1 do main() em Python)
  app.post('/api/agent/plan', async (req, res) => {
    const {
      prompt = 'showreel de motion design moderno',
      key1,
      key2,
      geminiModel = 'auto',
      duration = 30,
      width = 720,
      height = 1280,
      reaproveitar = 0.25,
    } = req.body || {};

    const logs: string[] = [];
    const storedHist = ler_json('historico_planos.json', memHistorico);
    const runs = Array.isArray(storedHist.runs) ? storedHist.runs : [];
    const dna = make_dna(runs);

    logs.push(
      `DNA: estilo=${dna.estilo} | estrutura=${dna.structure} | transição=${dna.transition} | bpm=${dna.bpm} | energia=${dna.energy}`
    );

    const chaves = extrairChaves(key1, key2);
    const tem_chave = chaves.length > 0;
    let modelos = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
    const miRef = { mi: 0 };

    if (tem_chave) {
      logs.push(`Chaves Gemini em uso: ${chaves.length} (as cenas alternam entre elas)`);
      const prep = await preparar_modelos(chaves, geminiModel);
      modelos = prep.modelos;
      logs.push(...prep.logs);
    }

    let plan: { title?: string; scenes?: Array<Record<string, unknown>> } | null = null;

    if (tem_chave) {
      const evitar =
        runs
          .slice(-3)
          .map((r) => String(r.title || ''))
          .filter(Boolean)
          .join('; ') || 'nenhum';

      const p = `Você é um diretor de motion design sênior e roteirista de showreels.
Crie o roteiro de um showreel vertical (9:16) de ${duration} segundos para o pedido abaixo.
Estilo visual obrigatório: ${dna.estilo} - ${dna.estilo_desc}.
Estrutura: ${dna.structure}. Energia ${dna.energy}/5. BPM ${dna.bpm}.
Regras: gancho forte na 1ª cena; alterne respiro e explosão; clímax perto do fim; a última cena é o card final.
Use de 7 a 9 cenas. Cada cena tem:
- "role": hook, body, climax ou closing (closing só na última)
- "text": texto principal CURTO em português (máx. 5 palavras, impactante)
- "sub": subtítulo opcional (máx. 8 palavras)
- "idea": descrição visual ESPECÍFICA e diferente das outras (formas, movimento, câmera, 1-2 frases)
- "weight": 1 a 3 (duração relativa)
Evite repetir estes títulos recentes: ${evitar}.
Responda APENAS com JSON: {"title":"...","scenes":[{"role":"hook","text":"...","sub":"...","idea":"...","weight":2}]}
PEDIDO: ${prompt}`;

      const gem = await geminiCall({
        prompt: p,
        chaves,
        modelos,
        miRef,
        json_mode: true,
        temperature: 1.0,
        chave: 0,
      });
      logs.push(...gem.logs);

      if (gem.text) {
        try {
          let txt = gem.text.trim().replace(/^`+|`+$/g, '').trim();
          if (txt.toLowerCase().startsWith('json')) {
            txt = txt.slice(4).trim();
          }
          const parsed = JSON.parse(txt);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.scenes)) {
            plan = parsed;
          }
        } catch (ex) {
          logs.push(`  Roteiro inválido: ${ex instanceof Error ? ex.message : String(ex)}`);
        }
      }
    }

    if (!plan) {
      logs.push(
        !tem_chave
          ? 'Modo offline (cenas prontas).'
          : 'Gemini falhou no roteiro - usando roteiro offline.'
      );
      plan = offline_plan(prompt);
    }

    const cleaned = clean_plan(plan);
    const durs = schedule(cleaned.scenes, dna.structure, Number(duration) || 30);
    const biblioteca = ler_json('biblioteca_cenas.json', memBiblioteca);

    let acc = 0;
    const scenes = cleaned.scenes.map((s, i) => {
      const dur = durs[i];
      const start = acc;
      acc += dur;
      const seed = Math.floor(1 + Math.random() * 1000000);

      const reuso = biblioteca.filter((e) => e.role === s.role && typeof e.code === 'string');
      if (reuso.length > 0 && Math.random() < Number(reaproveitar)) {
        const picked = rngChoice(reuso);
        logs.push(`  cena ${i + 1}/${cleaned.scenes.length} [${s.role}] reaproveitada da biblioteca`);
        return {
          ...s,
          dur,
          start,
          seed,
          code: String(picked.code),
          origem: 'biblioteca' as const,
          status: 'ready' as const,
        };
      }

      return {
        ...s,
        dur,
        start,
        seed,
        code: null,
        origem: 'fallback' as const,
        status: tem_chave ? ('compiling' as const) : ('ready' as const),
      };
    });

    logs.push(`Roteiro '${cleaned.title}': ${scenes.length} cenas`);

    runs.push({
      title: cleaned.title,
      structure: dna.structure,
      transition: dna.transition,
      estilo: dna.estilo,
      hue: dna.hue,
    });
    memHistorico = { runs: runs.slice(-30) };
    gravar_json('historico_planos.json', memHistorico);

    res.json({
      showreel: {
        title: cleaned.title,
        prompt,
        W: Number(width) || 720,
        H: Number(height) || 1280,
        duration: Number(duration) || 30,
        dna,
        scenes,
      },
      modelos,
      mi: miRef.mi,
      tem_chave,
      logs,
    });
  });

  // Endpoint 3: Pedir código de CADA cena alternando entre Chave 1 e Chave 2 (exatamente como pedir_cena() no Python)
  app.post('/api/agent/scene', async (req, res) => {
    const {
      dna,
      scene,
      idx = 0,
      total = 8,
      anterior = '',
      width = 720,
      height = 1280,
      key1,
      key2,
      modelos = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'],
      mi = 0,
    } = req.body || {};

    const logs: string[] = [];
    const chaves = extrairChaves(key1, key2);
    if (!chaves.length) {
      return res.json({
        code: null,
        origem: 'fallback',
        mi,
        logs: [`  cena ${idx + 1}/${total} [${scene?.role}] modo offline -> fallback`],
      });
    }

    logs.push(
      `  cena ${idx + 1}/${total} [${scene.role}] "${scene.text}" -> pedindo código ao Gemini...`
    );

    const pal = dna.pal;
    const p = `Você é um motion designer sênior que escreve JavaScript para Canvas 2D.
Escreva SOMENTE o CORPO de uma função (sem a palavra function, sem markdown, sem explicações), com estes parâmetros disponíveis:
(ctx, t, ts, W, H, P, M)
- ctx: CanvasRenderingContext2D, tela vertical W x H (${width}x${height}). O fundo em gradiente JÁ foi pintado.
- t: progresso da cena 0..1. ts: segundos desde o início da cena. P.dur: duração da cena em segundos.
- P: {text, role, seed, pulse (batida 0..1), bpm, energy (1-5), pal:{bg1,bg2,acc,acc2,fg,dim}}  (cores em hex)
  Paleta: bg1=${pal.bg1} bg2=${pal.bg2} acc=${pal.acc} acc2=${pal.acc2} fg=${pal.fg} dim=${pal.dim}
- ${M_API}
REGRAS:
1. A cena é uma função PURA de ts: sem estado, sem Date/performance.now, sem Math.random (use M.rng(P.seed)).
2. Anime TUDO com easing (nunca linear): entrada com antecipação/overshoot, movimento principal, detalhes secundários em atraso (overlap/stagger).
3. Use no mínimo 3 camadas: elementos de fundo, elemento principal, detalhes de primeiro plano. Reaja à batida com P.pulse.
4. O texto principal "${scene.text}" (use P.text) DEVE aparecer legível: use M.text/M.mainText/M.fit. NÃO desenhe o subtítulo (o motor desenha).
5. Use só as cores da paleta (e transparências). Mantenha ctx.save()/ctx.restore() equilibrados.
6. Leve: no máximo ~1500 formas por frame. Sem imagens, sem DOM, sem rede, sem bibliotecas.
CONTEXTO:
- Estilo do reel: ${dna.estilo} - ${dna.estilo_desc || ''}.
- Cena ${Number(idx) + 1} de ${total}, papel: ${scene.role}. Duração aprox. ${Number(scene.dur).toFixed(1)}s.
- Ideia visual desta cena: ${scene.idea || 'livre, coerente com o estilo'}
- Cena anterior (NÃO repita): ${anterior || 'nenhuma'}
Exemplo do FORMATO esperado (corpo da função, outra ideia):
${EXEMPLO}
Agora escreva o corpo da função da cena.`;

    const miRef = { mi: Number(mi) || 0 };
    // chave=idx faz a cena 0 começar na Chave 1, cena 1 começar na Chave 2, cena 2 na Chave 1...
    const gem = await geminiCall({
      prompt: p,
      chaves,
      modelos,
      miRef,
      temperature: 0.95,
      chave: Number(idx),
    });
    logs.push(...gem.logs);

    if (!gem.text) {
      logs.push('    sem código válido -> cena pronta (fallback)');
      return res.json({
        code: null,
        origem: 'fallback',
        mi: miRef.mi,
        logs,
      });
    }

    const m = gem.text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    const code = (m ? m[1] : gem.text).trim().replace(/^`+|`+$/g, '').trim();

    if (code.length < 40 || code.length > 16000) {
      logs.push('    sem código válido (tamanho inválido) -> cena pronta (fallback)');
      return res.json({
        code: null,
        origem: 'fallback',
        mi: miRef.mi,
        logs,
      });
    }

    if (PROIBIDO.some((b) => code.includes(b))) {
      logs.push('  (código com chamada proibida, descartado)');
      return res.json({
        code: null,
        origem: 'fallback',
        mi: miRef.mi,
        logs,
      });
    }

    const biblioteca = ler_json('biblioteca_cenas.json', memBiblioteca);
    biblioteca.push({
      role: scene.role,
      idea: scene.idea,
      estilo: dna.estilo,
      code,
    });
    memBiblioteca = biblioteca.slice(-80);
    gravar_json('biblioteca_cenas.json', memBiblioteca);

    res.json({
      code,
      origem: 'gemini',
      mi: miRef.mi,
      logs,
    });
  });

  app.get('/api/showreel/library', (_req, res) => {
    res.json({
      library: ler_json('biblioteca_cenas.json', memBiblioteca),
      runs: ler_json('historico_planos.json', memHistorico).runs || [],
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    app.use(express.static(distPath, { maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Motion Showreel Agent running on http://0.0.0.0:${PORT}`);
  });

  // Otimização para o Proxy Envoy/Cloudflare do Render (evita erro 502 Bad Gateway em conexões keep-alive)
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

startServer();
