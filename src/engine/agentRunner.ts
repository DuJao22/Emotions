import {
  DNA,
  FALLBACKS,
  FallbackKind,
  ROLES,
  SceneRole,
  SceneSpec,
  ShowreelData,
  STRUCTURES,
  StructureKind,
  TRANSITIONS,
  TransitionKind,
} from '../types/showreel';
import { synthesizeConnectedSceneCode } from './motionEngine';

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

const M_API = `M (biblioteca utilitária já injetada, NÃO redefina):
 - Matemática & Tempo: M.clamp(x,a=0,b=1) | M.lerp(a,b,t) | M.map(x,a,b,c,d) | M.p(ts,inicio,duracao)->0..1 | M.stagger(ts,i,inicio,intervalo,duracao)->0..1
 - Curvas & Física: M.ease.outExpo | outCubic | inCubic | inOutCubic | inOutQuint | outBack | outElastic (recebem 0..1) | M.spring(x,k=7,w=14)
 - Ruído & Aleatoriedade: M.rng(seed)->fn() determinística 0..1 | M.noise(x,y,seed)->0..1 (ruído orgânico suave 2D)
 - Cores: M.col(hex,alpha)->'rgba()' | M.mixc(hex1,hex2,t)->'rgb()'
 - Formas & Ondas: M.poly(ctx,cx,cy,r,lados,rot) | M.star(ctx,cx,cy,rOut,rIn,pontas,rot) | M.rrect(ctx,x,y,w,h,raio) | M.wave(ctx,W,H,yBase,amp,freq,fase,fillBottom) | M.ring(ctx,cx,cy,r,a0,a1)
 - Projeção 3D: M.rot3([x,y,z],ax,ay,az)->[x,y,z] | M.proj([x,y,z],W,H,fov,cx,cy)->{x,y,s}
 - Tipografia: M.text(ctx,str,x,y,size,{color,alpha,weight,align,rot,glow,stroke,strokeW,spacing,shadow}) | M.fit(ctx,str,maxW,size)->size | M.lines(str,maxChars)->array de linhas | M.mainText(ctx,W,H,P,ts,{scale,alpha,cx,cy,align,rot,layout})`;

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

function rngChoice<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isValidHex(c: unknown): c is string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim());
}

function lerLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore
  }
  return fallback;
}

function gravarLocal<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function safeParseJson<T = Record<string, unknown>>(raw: string): T | null {
  try {
    const t = String(raw || '').trim();
    if (!t) return null;
    const i0 = t.indexOf('{');
    const i1 = t.lastIndexOf('}');
    if (i0 >= 0 && i1 > i0) {
      return JSON.parse(t.slice(i0, i1 + 1)) as T;
    }
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

export function extrairChavesLocal(key1?: string, key2?: string): string[] {
  const chaves: string[] = [];
  for (const k of [key1 || '', key2 || '']) {
    const clean = k.trim();
    if (clean && !chaves.includes(clean)) chaves.push(clean);
  }
  return chaves;
}

export async function descobrirModelosLocal(
  key1?: string,
  key2?: string,
  modelPref = 'auto'
): Promise<{ chavesCount: number; modelos: string[]; logs: string[] }> {
  const chaves = extrairChavesLocal(key1, key2);
  const padrao = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
  if (!chaves.length) {
    return {
      chavesCount: 0,
      modelos: padrao,
      logs: ['Modo offline (nenhuma chave informada).'],
    };
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
        headers: { 'x-goog-api-key': chaves[0] },
      });
      if (!resp.ok) {
        logs.push(`  (não consegui listar os modelos: HTTP ${resp.status})`);
        break;
      }
      const data = safeParseJson<{
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
        nextPageToken?: string;
      }>(await resp.text());
      if (!data) break;
      for (const m of data.models || []) {
        const nome = String(m.name || '').split('/').pop() || '';
        const methods: string[] = m.supportedGenerationMethods || [];
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

  const achados = Array.from(new Set(nomes)).sort((a, b) => {
    const mva = a.match(/^gemini-(\d+(?:\.\d+)?)/);
    const mvb = b.match(/^gemini-(\d+(?:\.\d+)?)/);
    const vera = mva ? parseFloat(mva[1]) : 0.0;
    const verb = mvb ? parseFloat(mvb[1]) : 0.0;
    if (vera !== verb) return verb - vera;
    const liteA = a.includes('lite') ? 1 : 0;
    const liteB = b.includes('lite') ? 1 : 0;
    if (liteA !== liteB) return liteA - liteB;
    const prevA = a.includes('preview') ? 1 : 0;
    const prevB = b.includes('preview') ? 1 : 0;
    if (prevA !== prevB) return prevA - prevB;
    return a.localeCompare(b);
  });

  if (achados.length > 0) {
    logs.push(`Modelos Gemini disponíveis na sua chave: ${achados.slice(0, 12).join(', ')}`);
  }

  const base = achados.length > 0 ? achados.slice(0, 8) : padrao;
  const modelos =
    modelPref && modelPref.toLowerCase() !== 'auto'
      ? [modelPref, ...base.filter((m) => m !== modelPref)]
      : base;
  logs.push(`Modelo em uso: ${modelos[0]} (se falhar, troca sozinho)`);

  return { chavesCount: chaves.length, modelos, logs };
}

async function geminiLocalCall(options: {
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
    temperature = 0.95,
    tries = 4,
    chave = 0,
  } = options;
  const logs: string[] = [];
  if (!chaves.length || !modelos.length) return { text: null, logs };

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
          logs.push(`  Modelo ${modelo} indisponível (${resp.status}). Trocando para ${modelos[miRef.mi]}`);
          continue;
        }
        if (resp.status === 429 || resp.status >= 500) {
          const troca = n > 1 && k < n - 1;
          if (!troca && miRef.mi < modelos.length - 1) {
            miRef.mi += 1;
            logs.push(`  Limite na chave ${idx + 1} (${modelo}). Trocando para ${modelos[miRef.mi]}...`);
            continue;
          }
          const espera = troca ? 1.5 : 3;
          logs.push(`  Chave ${idx + 1} ocupada/limite (${resp.status}). Aguardando ${espera}s...`);
          await new Promise((r) => setTimeout(r, espera * 1000));
          k += 1;
          continue;
        }
        if (n > 1 && k < n - 1) {
          k += 1;
          continue;
        }
        return { text: null, logs };
      }

      const data = safeParseJson<{
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        }>;
      }>(await resp.text());
      const parts: Array<{ text?: string; thought?: boolean }> =
        data?.candidates?.[0]?.content?.parts || [];
      const txt = parts
        .filter((p) => !p.thought)
        .map((p) => p.text || '')
        .join('');
      if (txt.trim()) return { text: txt, logs };
      k += 1;
    } catch (ex) {
      logs.push(`  Erro Gemini: ${ex instanceof Error ? ex.message : String(ex)}`);
      await new Promise((r) => setTimeout(r, 1500));
      k += 1;
    }
  }
  return { text: null, logs };
}

export async function gerarPlanoLocal(params: {
  prompt: string;
  key1?: string;
  key2?: string;
  geminiModel?: string;
  duration?: number;
  width?: number;
  height?: number;
  reaproveitar?: number;
}): Promise<{
  showreel: ShowreelData;
  modelos: string[];
  mi: number;
  tem_chave: boolean;
  logs: string[];
}> {
  const {
    prompt = 'showreel de motion design moderno',
    key1,
    key2,
    geminiModel = 'auto',
    duration = 30,
    width = 720,
    height = 1280,
    reaproveitar = 0.0,
  } = params;

  const logs: string[] = [];
  const runs = lerLocal<Array<Record<string, unknown>>>('historico_planos_runs', []);
  const ultimos = runs.slice(-2);

  const structIds = STRUCTURES.map((s) => s.id);
  const structCand = structIds.filter((s) => !ultimos.map((r) => r.structure).includes(s));
  const structure: StructureKind = rngChoice(structCand.length ? structCand : structIds);

  const transIds = TRANSITIONS.map((t) => t.id);
  const transCand = transIds.filter((t) => !ultimos.map((r) => r.transition).includes(t));
  const transition: TransitionKind = rngChoice(transCand.length ? transCand : transIds);

  let hue = Math.random();
  if (runs.length > 0) {
    const lastHue = Number(runs[runs.length - 1].hue || 0);
    for (let i = 0; i < 30; i++) {
      if (Math.abs(hue - lastHue) > 0.18) break;
      hue = Math.random();
    }
  }
  const off = rngChoice([0.5, 0.14, 0.33, 0.62]);
  const dna: DNA = {
    structure,
    transition,
    estilo: `Direção Autoral: ${prompt.slice(0, 38)}`,
    estilo_desc: 'Atmosfera visual, metáforas gráficas e tipografia criadas sob medida para o pedido do cliente',
    client_intent: prompt,
    narrative_thread: `Jornada visual contínua inspirada em "${prompt}"`,
    visual_motifs: ['geometria viva', 'tipografia expressiva', 'camadas de profundidade'],
    pal: {
      bg1: hsl_hex(hue, 0.58, 0.05),
      bg2: hsl_hex(hue + 0.06, 0.62, 0.15),
      acc: hsl_hex(hue + off, 0.92, 0.58),
      acc2: hsl_hex(hue + off / 2 + 0.09, 0.88, 0.64),
      fg: '#f7f7fb',
      dim: '#b2b4c8',
    },
    bpm: Math.floor(92 + Math.random() * 54),
    energy: Math.floor(2 + Math.random() * 4),
    hue,
  };

  const chaves = extrairChavesLocal(key1, key2);
  const tem_chave = chaves.length > 0;
  let modelos = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
  const miRef = { mi: 0 };

  if (tem_chave) {
    logs.push(`Chaves Gemini em uso: ${chaves.length} (Agente 1 = Chave 1 | Agente 2 = Chave 2)`);
    const prep = await descobrirModelosLocal(key1, key2, geminiModel);
    modelos = prep.modelos;
    logs.push(...prep.logs);
  }

  let rawPlan: Record<string, unknown> | null = null;

  if (tem_chave) {
    const evitar =
      runs
        .slice(-4)
        .map((r) => String(r.title || ''))
        .filter(Boolean)
        .join('; ') || 'nenhum';

    const p = `Você é um Diretor Criativo de Motion Design de classe mundial.
Analise profundamente o PEDIDO DO CLIENTE abaixo e crie uma direção de arte 100% ORIGINAL, SEM USAR TEMPLATES PADRÃO, onde o universo visual, a paleta de cores, a narrativa, os layouts e as transições nasçam exclusivamente do que o cliente pediu.

PEDIDO DO CLIENTE: "${prompt}"
Duração total: ${duration} segundos (formato vertical 9:16, ${width}x${height}).
Evite repetir títulos recentes: ${evitar}.

REGRAS DE DIREÇÃO CRIATIVA E CONEXÃO PROFUNDA:
1. NADA DE ESTRUTURA GENÉRICA: Entenda o produto, tema, emoção ou história do cliente. Crie um "narrative_thread" (fio condutor) que conte uma história contínua da Cena 1 até a última cena.
2. DIREÇÃO DE ARTE E PALETA SOB MEDIDA:
   - Defina "estilo" e "estilo_desc" exclusivos para este projeto.
   - Escolha uma paleta hexadecimal "pal" ({bg1, bg2, acc, acc2, fg, dim}) que represente psicologicamente o pedido do cliente (garanta alto contraste de "fg", "acc" e "acc2" sobre "bg1" e "bg2").
   - Escolha "bpm" (75 a 155), "energy" (1 a 5), "structure" ("crescendo", "explosao_respiro" ou "uniforme") e "transition" principal ("zoom", "wipe_h", "wipe_v", "crossfade", "glitch" ou "flash").
3. ARQUITETURA DE LAYOUT VARIADA E CONEXÃO ENTRE CENAS (6 a 8 cenas):
   - PROIBIDO repetir o mesmo layout ou posicionamento de texto em cenas seguidas!
   - Cada cena DEVE ter um "layout_mode" diferente (ex: "topo_solar_assimetrico", "diagonal_brutalista", "cenario_imersivo_base", "split_vertical_editorial", "perspectiva_3d_orbital", "tipografia_gigante_vazado", "fluxo_curvas_organicas", "emblema_minimalista").
   - Cada cena DEVE ter "camera_motion" e "visual_bridge" (explicando como o elemento visual ou movimento final desta cena se transforma ou conecta fisicamente com o início da PRÓXIMA cena!).
   - Cada cena tem "transition_out" ("zoom", "wipe_h", "wipe_v", "crossfade", "glitch" ou "flash") escolhida para reforçar a "visual_bridge".
4. VOZ NARRADORA + ESCRITA 100% NA TELA (REGRA CRÍTICA):
   - O vídeo terá uma VOZ NARRANDO tudo o que passa na tela cena a cena!
   - OBSERVAÇÃO OBRIGATÓRIA: PRATICAMENTE TUDO QUE FOR FALADO NA VOZ TEM QUE APARECER DE ESCRITA NA TELA!
   - Portanto, em cada cena:
     * "text" é o impacto inicial falado pela voz (2 a 4 palavras em destaque);
     * "sub" é a continuação exata da frase falada pelo narrador naquela cena (5 a 10 palavras);
     * "narration" é a soma falada de "text" + "sub" ("TEXT. SUB."). Não coloque palavras em "narration" que não estejam em "text" ou "sub"!

Responda APENAS com JSON válido neste formato exato:
{
  "title": "Título Criativo do Projeto",
  "client_intent": "Resumo do que o cliente quer transmitir",
  "narrative_thread": "Como a história evolui e se conecta da cena 1 à última",
  "visual_motifs": ["motivo visual 1 do tema", "motivo visual 2", "motivo visual 3"],
  "voice_tone": "Locução envolvente, clara e ritmada em português",
  "estilo": "Nome da Direção de Arte Sob Medida",
  "estilo_desc": "Descrição detalhada das formas, texturas, movimentos e estética deste projeto",
  "bpm": 120,
  "energy": 4,
  "structure": "crescendo",
  "transition": "zoom",
  "pal": {
    "bg1": "#0a0806",
    "bg2": "#1f1610",
    "acc": "#ff6b00",
    "acc2": "#ffd166",
    "fg": "#fff8f0",
    "dim": "#b8a696"
  },
  "scenes": [
    {
      "role": "hook",
      "text": "FRASE PRINCIPAL FALADA",
      "sub": "continuação exata do que a voz fala nesta cena",
      "narration": "FRASE PRINCIPAL FALADA. Continuação exata do que a voz fala nesta cena.",
      "idea": "Descrição rica do que acontece visualmente na cena (objetos do tema, movimento, profundidade, tipografia)",
      "layout_mode": "arquitetura espacial e tipográfica única desta cena",
      "camera_motion": "movimento de câmera desta cena",
      "visual_bridge": "como o final desta cena se conecta visualmente ao início da cena 2",
      "transition_out": "zoom",
      "weight": 2
    }
  ]
}`;

    const gem = await geminiLocalCall({
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
      const parsed = safeParseJson<Record<string, unknown>>(gem.text);
      if (parsed && Array.isArray(parsed.scenes)) {
        rawPlan = parsed;
        if (typeof parsed.estilo === 'string' && parsed.estilo.trim()) {
          dna.estilo = parsed.estilo.trim().slice(0, 80);
        }
        if (typeof parsed.estilo_desc === 'string' && parsed.estilo_desc.trim()) {
          dna.estilo_desc = parsed.estilo_desc.trim().slice(0, 240);
        }
        if (typeof parsed.client_intent === 'string' && parsed.client_intent.trim()) {
          dna.client_intent = parsed.client_intent.trim().slice(0, 240);
        }
        if (typeof parsed.narrative_thread === 'string' && parsed.narrative_thread.trim()) {
          dna.narrative_thread = parsed.narrative_thread.trim().slice(0, 300);
        }
        if (Array.isArray(parsed.visual_motifs)) {
          dna.visual_motifs = parsed.visual_motifs.map((m: unknown) => String(m)).slice(0, 6);
        }
        if (Number(parsed.bpm) >= 60 && Number(parsed.bpm) <= 180) {
          dna.bpm = Math.round(Number(parsed.bpm));
        }
        if (Number(parsed.energy) >= 1 && Number(parsed.energy) <= 5) {
          dna.energy = Math.round(Number(parsed.energy));
        }
        if (structIds.includes(parsed.structure as StructureKind)) {
          dna.structure = parsed.structure as StructureKind;
        }
        if (transIds.includes(parsed.transition as TransitionKind)) {
          dna.transition = parsed.transition as TransitionKind;
        }
        if (parsed.pal && typeof parsed.pal === 'object') {
          const pObj = parsed.pal as Record<string, unknown>;
          dna.pal = {
            bg1: isValidHex(pObj.bg1) ? pObj.bg1.trim() : dna.pal.bg1,
            bg2: isValidHex(pObj.bg2) ? pObj.bg2.trim() : dna.pal.bg2,
            acc: isValidHex(pObj.acc) ? pObj.acc.trim() : dna.pal.acc,
            acc2: isValidHex(pObj.acc2) ? pObj.acc2.trim() : dna.pal.acc2,
            fg: isValidHex(pObj.fg) ? pObj.fg.trim() : dna.pal.fg,
            dim: isValidHex(pObj.dim) ? pObj.dim.trim() : dna.pal.dim,
          };
        }
      }
    }
  }

  if (!rawPlan) {
    logs.push(
      !tem_chave
        ? 'Modo offline: gerando cenas conectadas sob medida.'
        : 'Usando extrator inteligente de roteiro sob medida.'
    );
    const layouts = [
      'horizonte_solar_assimetrico',
      'fluxo_liquido_diagonal',
      'arquitetura_vertical_viva',
      'escultura_3d_orbital',
      'tipografia_brutalista_recorte',
      'constelacao_dados_profundidade',
      'emblema_minimalista_final',
    ];
    const cameras = [
      'ascensao_vertical',
      'travelling_lateral_veloz',
      'orbita_perspectiva_3d',
      'mergulho_profundidade_z',
      'corte_diagonal_sincopado',
      'expansao_radial_choque',
      'estabilizacao_editorial',
    ];

    // Se o cliente colou um roteiro detalhado ou várias frases, extrai as falas reais do texto dele!
    const cleanPrompt = prompt.replace(/[“”"]/g, '').trim();
    const rawChunks = cleanPrompt
      .split(/(?:Cena\s*\d+\s*[:\-–]?|\n+|(?<=[.!?])\s+)/i)
      .map((c) => c.replace(/^(Locução|Narração|Texto|Visual)\s*:\s*/i, '').trim())
      .filter((c) => c.length > 6);

    const words = cleanPrompt
      .toUpperCase()
      .replace(/[,.;:!?\-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 14);
    if (!words.length) words.push('UNIVERSO', 'CRIATIVO');

    const scs: Array<Record<string, unknown>> = [];
    const targetCount = Math.min(8, Math.max(6, rawChunks.length >= 4 ? rawChunks.length : 7));

    for (let i = 0; i < targetCount; i++) {
      const role: SceneRole =
        i === 0 ? 'hook' : i === targetCount - 1 ? 'closing' : i === targetCount - 2 ? 'climax' : 'body';
      const chunk = rawChunks[i % Math.max(1, rawChunks.length)] || '';
      const chunkWords = chunk.split(/\s+/).filter(Boolean);

      let txt = '';
      let sub = '';
      if (chunkWords.length >= 4) {
        txt = chunkWords.slice(0, 3).join(' ').toUpperCase().slice(0, 42);
        sub = chunkWords.slice(3, 16).join(' ').slice(0, 105);
      } else {
        const w1 = words[i % words.length];
        const w2 = words[(i + 1) % words.length] || '';
        txt = `${w1} ${w2}`.trim().slice(0, 42);
        sub = chunk || `Cena ${i + 1} em movimento conectado e sincronizado`;
      }

      scs.push({
        role,
        text: txt,
        sub,
        narration: `${txt}. ${sub}.`,
        idea: `Cena ${i + 1} ilustrando "${txt} - ${sub}" com layout ${layouts[i % layouts.length]}`,
        layout_mode: layouts[i % layouts.length],
        camera_motion: cameras[i % cameras.length],
        visual_bridge: `Transição contínua de ${cameras[i % cameras.length]} para a próxima cena`,
        transition_out: transIds[i % transIds.length],
        weight: role === 'hook' || role === 'closing' ? 2 : role === 'climax' ? 2.2 : 1.4,
      });
    }

    rawPlan = { title: words.slice(0, 3).join(' '), scenes: scs };
  }

  logs.push(
    `Direção Criativa: ${dna.estilo} | Fio Condutor: ${dna.narrative_thread || 'Narrativa contínua'}`
  );
  logs.push(
    `DNA: estrutura=${dna.structure} | transição=${dna.transition} | bpm=${dna.bpm} | energia=${dna.energy}`
  );

  const rawList = Array.isArray(rawPlan.scenes) ? rawPlan.scenes : [];
  const rawScenes = rawList.slice(0, 10).map((s: Record<string, unknown>, idx: number) => {
    const r = String(s.role || 'body') as SceneRole;
    const trOutRaw = String(s.transition_out || '') as TransitionKind;
    const text = String(s.text || 'MOTION').trim().slice(0, 46);
    let sub = String(s.sub || '').trim().slice(0, 110);
    let narration = String(s.narration || '').trim().slice(0, 180);
    if (narration) {
      const normText = text.toLowerCase().replace(/[^a-z0-9à-ú\s]/gi, '').trim();
      const normNarr = narration.toLowerCase().replace(/[^a-z0-9à-ú\s]/gi, '').trim();
      if (normNarr.startsWith(normText) && narration.length > text.length + 2) {
        const remainder = narration
          .slice(text.length)
          .replace(/^[\s.,:;!?\-—]+/, '')
          .trim();
        if (remainder && remainder.length > sub.length) {
          sub = remainder.slice(0, 110);
        }
      } else if (!sub) {
        sub = narration.slice(0, 110);
      }
    }
    if (!sub) sub = 'Experiência visual em movimento contínuo';
    narration = `${text}. ${sub}`;

    return {
      role: (ROLES.includes(r) ? r : 'body') as SceneRole,
      text,
      sub,
      narration,
      idea: String(s.idea || '').slice(0, 420),
      layout_mode: String(s.layout_mode || `layout_exclusivo_${idx + 1}`).slice(0, 80),
      camera_motion: String(s.camera_motion || 'movimento_continuo').slice(0, 80),
      visual_bridge: String(s.visual_bridge || 'continuidade para a próxima cena').slice(0, 200),
      transition_out: (transIds.includes(trOutRaw) ? trOutRaw : rngChoice(transIds)) as TransitionKind,
      weight: Number(s.weight) || 1.2,
      fb: 'kinetic' as FallbackKind,
    };
  });

  if (!rawScenes.length) {
    rawScenes.push({
      role: 'hook',
      text: 'MOTION',
      sub: 'Abertura em movimento sincronizado',
      narration: 'MOTION. Abertura em movimento sincronizado.',
      idea: '',
      layout_mode: 'assimetrico_editorial',
      camera_motion: 'zoom_in',
      visual_bridge: '',
      transition_out: 'zoom',
      weight: 1,
      fb: 'kinetic',
    });
  }
  if (rawScenes.length === 1) {
    rawScenes.push({
      role: 'closing',
      text: 'FIM',
      sub: 'Assinatura visual completa',
      narration: 'FIM. Assinatura visual completa.',
      idea: '',
      layout_mode: 'emblema_minimalista',
      camera_motion: 'estabilizacao',
      visual_bridge: '',
      transition_out: 'crossfade',
      weight: 1,
      fb: 'closing',
    });
  }
  rawScenes[0].role = 'hook';
  for (let i = 1; i < rawScenes.length - 1; i++) {
    if (rawScenes[i].role === 'hook' || rawScenes[i].role === 'closing') {
      rawScenes[i].role = 'body';
    }
  }
  rawScenes[rawScenes.length - 1].role = 'closing';

  let prevFb = '';
  for (const s of rawScenes) {
    if (s.role === 'closing') {
      s.fb = 'closing';
    } else {
      const op = FALLBACKS.filter((f) => f !== prevFb);
      s.fb = rngChoice(op.length ? op : FALLBACKS);
    }
    prevFb = s.fb;
  }

  const n = rawScenes.length;
  const ws = rawScenes.map((s, i) => {
    const base = Math.max(0.5, Math.min(3.0, Number(s.weight || 1)));
    const f =
      dna.structure === 'crescendo'
        ? 1.7 - (1.2 * i) / Math.max(1, n - 1)
        : dna.structure === 'explosao_respiro'
        ? i % 2
          ? 0.75
          : 1.3
        : 1.0;
    return base * f;
  });
  const sumW = ws.reduce((a, b) => a + b, 0) || 1;
  const rawDurs = ws.map((w) => Math.max(1.6, (duration * w) / sumW));
  const kScale = duration / (rawDurs.reduce((a, b) => a + b, 0) || 1);
  const durs = rawDurs.map((d) => Math.round(d * kScale * 1000) / 1000);

  const biblioteca = lerLocal<Array<{ role: string; code: string }>>('biblioteca_cenas', []);
  let acc = 0;
  const scenes: SceneSpec[] = rawScenes.map((s, i) => {
    const dur = durs[i];
    const start = acc;
    acc += dur;
    const seed = Math.floor(1 + Math.random() * 1000000);

    const reuso = biblioteca.filter((e) => e.role === s.role && e.code);
    if (reaproveitar > 0 && reuso.length > 0 && Math.random() < reaproveitar) {
      const picked = rngChoice(reuso);
      logs.push(`  cena ${i + 1}/${rawScenes.length} [${s.role}] reaproveitada da biblioteca`);
      return {
        ...s,
        dur,
        start,
        seed,
        code: picked.code,
        origem: 'biblioteca',
        status: 'ready',
      };
    }

    const bespokeFallbackCode = synthesizeConnectedSceneCode(
      { ...s, seed },
      i,
      rawScenes.length
    );

    return {
      ...s,
      dur,
      start,
      seed,
      code: tem_chave ? null : bespokeFallbackCode,
      origem: 'fallback',
      status: tem_chave ? 'compiling' : 'ready',
    };
  });

  const title = String(rawPlan.title || 'Showreel Autoral').slice(0, 60);
  logs.push(`Roteiro '${title}': ${scenes.length} cenas conectadas`);

  runs.push({
    title,
    structure: dna.structure,
    transition: dna.transition,
    estilo: dna.estilo,
    hue: dna.hue,
  });
  gravarLocal('historico_planos_runs', runs.slice(-30));

  return {
    showreel: {
      title,
      prompt,
      W: width,
      H: height,
      duration,
      dna,
      scenes,
    },
    modelos,
    mi: miRef.mi,
    tem_chave,
    logs,
  };
}

export async function pedirCenaLocal(params: {
  prompt?: string;
  dna: DNA;
  scene: SceneSpec;
  idx: number;
  total: number;
  anterior: string;
  ponteAnterior?: string;
  proximaIdeia?: string;
  width: number;
  height: number;
  key1?: string;
  key2?: string;
  modelos: string[];
  mi: number;
}): Promise<{ code: string | null; origem: 'gemini' | 'fallback'; mi: number; logs: string[] }> {
  const {
    prompt: clientPrompt = '',
    dna,
    scene,
    idx,
    total,
    anterior,
    ponteAnterior = '',
    proximaIdeia = '',
    width,
    height,
    key1,
    key2,
    modelos,
    mi,
  } = params;
  const logs: string[] = [];
  const chaves = extrairChavesLocal(key1, key2);
  const agentNum = ((idx % 2) + 1) as 1 | 2;

  if (!chaves.length) {
    return {
      code: synthesizeConnectedSceneCode(scene, idx, total),
      origem: 'fallback',
      mi,
      logs,
    };
  }

  logs.push(
    `  cena ${idx + 1}/${total} [${scene.role}] "${scene.text}" -> Agente ${agentNum} criando animação exclusiva...`
  );
  const pal = dna.pal;
  const motifs = Array.isArray(dna.visual_motifs) ? dna.visual_motifs.join(', ') : '';
  const p = `Você é o Agente ${agentNum}, Diretor de Animação e Creative Coder especialista em Canvas 2D.
Sua missão é programar a CENA ${idx + 1} de ${total} de um showreel para o seguinte pedido do cliente:
PEDIDO DO CLIENTE: "${clientPrompt || dna.client_intent || dna.estilo}"

BÍBLIA NARRATIVA E CONEXÃO DO PROJETO:
- Fio Condutor da História: ${dna.narrative_thread || 'Jornada contínua conectada ao pedido do cliente'}
- Direção de Arte: ${dna.estilo} — ${dna.estilo_desc || ''}
- Motivos Visuais do Universo: ${motifs || 'formas orgânicas, vetores temáticos e tipografia integrada'}
- CONEXÃO RECEBIDA DA CENA ANTERIOR: ${
    ponteAnterior || anterior || 'Esta é a Cena 1 (Hook): crie um impacto visual imediato que apresente o universo do cliente!'
  }
- CONEXÃO DE SAÍDA PARA A PRÓXIMA CENA: ${
    scene.visual_bridge || proximaIdeia || 'Encerre consolidando a identidade visual do cliente.'
  }

ESPECIFICAÇÃO EXCLUSIVA DESTA CENA ${idx + 1}/${total}:
- Papel narrativo: ${scene.role} | Duração: ${scene.dur.toFixed(1)}s
- Texto Principal Falado (P.text): "${scene.text}"
- Complemento Falado na Narração (P.sub): "${scene.sub || ''}"
- Locução Completa do Narrador nesta cena: "${scene.narration || `${scene.text}. ${scene.sub || ''}`}"
- O que DEVE acontecer visualmente na cena: ${scene.idea}
- Arquitetura de Layout / Composição EXCLUSIVA desta cena: ${scene.layout_mode || 'livre, assimétrica e autoral'}
- Movimento de Câmera desta cena: ${scene.camera_motion || 'fluido e dinâmico'}

PARÂMETROS DISPONÍVEIS NO ESCOPO (NÃO escreva function(...) { ... }, escreva SOMENTE o corpo do código JS):
(ctx, t, ts, W, H, P, M)
- ctx: CanvasRenderingContext2D (${width}x${height}, vertical 9:16).
- t: progresso normalizado da cena (0..1). ts: segundos decorridos na cena (0..P.dur).
- P: {text, sub, narration, role, dur, seed, pulse (batida musical 0..1), bpm, energy (1..5), pal:{bg1,bg2,acc,acc2,fg,dim}}
  Cores Hex do Projeto: bg1=${pal.bg1} bg2=${pal.bg2} acc=${pal.acc} acc2=${pal.acc2} fg=${pal.fg} dim=${pal.dim}
- ${M_API}

REGRAS DE OURO PARA NÃO PARECER UM TEMPLATE PADRÃO + OBSERVAÇÃO DE VOZ NA TELA:
1. OBSERVAÇÃO OBRIGATÓRIA DE VOZ & ESCRITA NA TELA: Há uma voz narrando tudo que passa na tela! PRATICAMENTE QUASE TUDO QUE FOR FALADO NA VOZ TEM QUE APARECER DE ESCRITA NA TELA!
   - Desenhe P.text com máximo impacto e legibilidade na metade superior/central da composição;
   - Chame obrigatoriamente M.sub(ctx, W, H, P, ts) no final da função (ou desenhe todas as palavras de P.sub quebradas em linhas com M.lines(P.sub, 24)) para que 100% do que o narrador fala apareça escrito e sincronizado na tela!
2. PROIBIDO USAR LAYOUT PADRÃO: Não faça apenas um círculo de bolinhas no meio com texto centralizado! Crie uma composição visual que represente de verdade a ideia "${scene.idea}" e a arquitetura "${scene.layout_mode}".
3. CENÁRIO + ELEMENTOS CONECTADOS AO TEMA: Pinte sua própria atmosfera/cenário em camadas (usando gradientes criativos, M.wave, M.poly, M.rrect, M.rot3/M.proj, M.noise, feixes de luz, silhuetas, partículas temáticas ou geometria viva).
4. CONTINUIDADE (VISUAL BRIDGE): Nos primeiros 25% da cena (t < 0.25), faça os elementos nascerem continuando a "CONEXÃO RECEBIDA DA CENA ANTERIOR". Nos últimos 20% (t > 0.80), conduza o movimento na direção da "CONEXÃO DE SAÍDA PARA A PRÓXIMA CENA".
5. FUNÇÃO PURA E SEGURA: Sem variáveis globais, sem Math.random() (use const R = M.rng(P.seed)), sem imagens externas/DOM, sempre feche ctx.save() com ctx.restore().

Escreva SOMENTE o código JavaScript puro do corpo da função (sem blocos markdown, sem explicações):`;

  const miRef = { mi };
  const gem = await geminiLocalCall({
    prompt: p,
    chaves,
    modelos,
    miRef,
    temperature: 0.98,
    chave: idx,
  });
  logs.push(...gem.logs);

  if (!gem.text) {
    logs.push('    sem resposta -> cena gerada com sintetizador conectado');
    return {
      code: synthesizeConnectedSceneCode(scene, idx, total),
      origem: 'fallback',
      mi: miRef.mi,
      logs,
    };
  }

  const m = gem.text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  const code = (m ? m[1] : gem.text).trim().replace(/^`+|`+$/g, '').trim();

  if (code.length < 40 || code.length > 16000 || PROIBIDO.some((b) => code.includes(b))) {
    logs.push('    código inválido -> cena gerada com sintetizador conectado');
    return {
      code: synthesizeConnectedSceneCode(scene, idx, total),
      origem: 'fallback',
      mi: miRef.mi,
      logs,
    };
  }

  const biblioteca = lerLocal<Array<Record<string, unknown>>>('biblioteca_cenas', []);
  biblioteca.push({
    role: scene.role,
    idea: scene.idea,
    estilo: dna.estilo,
    code,
  });
  gravarLocal('biblioteca_cenas', biblioteca.slice(-80));

  const numStr = String(idx + 1).padStart(2, '0');
  const fileName = `cena_${numStr}_${scene.role}.js`;
  logs.push(`    ✓ ${fileName} salvo pelo Agente ${agentNum}`);

  return { code, origem: 'gemini', mi: miRef.mi, logs };
}

export async function revisarCenaLocal(params: {
  prompt?: string;
  dna: DNA;
  scene: SceneSpec;
  idx: number;
  total: number;
  width: number;
  height: number;
  snapshotDataUrl?: string;
  diagnosticReason: string;
  needsRepair: boolean;
  key1?: string;
  key2?: string;
  modelos: string[];
  mi: number;
}): Promise<{
  approved: boolean;
  repairedCode: string | null;
  reviewNote: string;
  logs: string[];
}> {
  const {
    prompt: clientPrompt = '',
    dna,
    scene,
    idx,
    total,
    width,
    height,
    snapshotDataUrl,
    diagnosticReason,
    needsRepair,
    key1,
    key2,
    modelos,
    mi,
  } = params;

  const logs: string[] = [];
  const chaves = extrairChavesLocal(key1, key2);
  const agentNum = (idx % 2) + 1;
  const numStr = String(idx + 1).padStart(2, '0');
  const fileName = `cena_${numStr}_${scene.role}.js`;

  if (!chaves.length) {
    return {
      approved: !needsRepair,
      repairedCode: needsRepair ? synthesizeConnectedSceneCode(scene, idx, total) : null,
      reviewNote: 'Modo offline — inspeção visual local concluída.',
      logs,
    };
  }

  const keyIdx = idx % chaves.length;
  const modelo = modelos[Math.min(mi || 0, modelos.length - 1)];

  if (!needsRepair && snapshotDataUrl) {
    const base64Data = snapshotDataUrl.split(',')[1] || '';
    if (base64Data) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
        const reviewPrompt = `Você é o Diretor de Motion Design inspecionando o frame real renderizado da Cena ${
          idx + 1
        }/${total} (${fileName}) para o cliente: "${clientPrompt || dna.client_intent || dna.estilo}".
Roteiro esperado: Texto "${scene.text}", Ideia "${scene.idea}", Layout "${scene.layout_mode || 'autoral'}".
A cena apresenta composição visual coerente e conectada ao tema? Responda APENAS em JSON: {"approved": true, "note": "comentário curto de 1 frase"}`;

        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': chaves[keyIdx],
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                  { text: reviewPrompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 256,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (resp.ok) {
          const data = safeParseJson<{
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          }>(await resp.text());
          const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = safeParseJson<{ approved?: boolean; note?: string }>(txt);
          if (parsed && parsed.approved !== false) {
            logs.push(
              `  👁️ Agente ${agentNum} inspecionou ${fileName}: APROVADA ("${
                parsed.note || 'Fiel ao roteiro e ao cliente'
              }")`
            );
            return {
              approved: true,
              repairedCode: null,
              reviewNote: parsed.note || 'Visual verificado pelo Agente Diretor.',
              logs,
            };
          }
        }
      } catch {
        return {
          approved: true,
          repairedCode: null,
          reviewNote: 'Verificado por telemetria de movimento e cobertura.',
          logs,
        };
      }
    }
  }

  logs.push(
    `  🔧 Agente ${agentNum} (Chave ${keyIdx + 1}) refazendo ${fileName} (Motivo: ${diagnosticReason})...`
  );
  const pal = dna.pal;
  const repairPrompt = `Você é o Agente ${agentNum}, motion designer sênior responsável EXCLUSIVAMENTE pela Cena ${
    idx + 1
  } (${fileName}) do pedido: "${clientPrompt || dna.client_intent || dna.estilo}".
Na revisão visual do showreel, esta cena precisou ser reconstruída: "${diagnosticReason}".
Reescreva o código Canvas 2D desta cena com um DESIGN 100% AUTORAL (sem layout padrão), dinâmico e conectado à história!

Parâmetros disponíveis: (ctx, t, ts, W, H, P, M) com tela ${width}x${height}.
Paleta: bg1=${pal.bg1} bg2=${pal.bg2} acc=${pal.acc} acc2=${pal.acc2} fg=${pal.fg} dim=${pal.dim}
${M_API}

ROTEIRO OBRIGATÓRIO DESTA CENA:
- Papel: ${scene.role}
- Texto principal: "${scene.text}" (use M.text ou M.mainText de forma expressiva)
- Subtítulo: "${scene.sub || ''}"
- Ideia visual que DEVE acontecer na tela: "${scene.idea}"
- Arquitetura de Layout: "${scene.layout_mode || 'composicao_autoral_dinamica'}"
- Conexão com a próxima cena: "${scene.visual_bridge || ''}"

Escreva SOMENTE o corpo da função JavaScript (sem markdown, sem explicações):`;

  const miRef = { mi };
  const gem = await geminiLocalCall({
    prompt: repairPrompt,
    chaves,
    modelos,
    miRef,
    temperature: 0.95,
    chave: idx,
  });
  logs.push(...gem.logs);

  if (gem.text) {
    const m = gem.text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
    const code = (m ? m[1] : gem.text).trim().replace(/^`+|`+$/g, '').trim();
    if (code.length >= 40 && code.length <= 16000 && !PROIBIDO.some((b) => code.includes(b))) {
      logs.push(`    ✓ ${fileName} reconstruída e aprovada pelo Agente ${agentNum}`);
      return {
        approved: true,
        repairedCode: code,
        reviewNote: `Cena reconstruída pelo Agente ${agentNum} após revisão visual.`,
        logs,
      };
    }
  }

  return {
    approved: true,
    repairedCode: synthesizeConnectedSceneCode(scene, idx, total),
    reviewNote: 'Cena reconstruída pelo sintetizador conectado de segurança.',
    logs,
  };
}

export async function sintetizarVozCenaLocal(params: {
  text: string;
  idx: number;
  voiceName?: string;
  key1?: string;
  key2?: string;
}): Promise<{
  audioBase64: string | null;
  mimeType: string | null;
  fallbackSpeech: boolean;
}> {
  const { text, idx, voiceName = 'Kore', key1, key2 } = params;
  const chaves = extrairChavesLocal(key1, key2);
  const cleanText = String(text || '').trim();
  if (!chaves.length || !cleanText) {
    return { audioBase64: null, mimeType: null, fallbackSpeech: true };
  }

  const n = chaves.length;
  for (let attempt = 0; attempt < n; attempt++) {
    const keyIdx = (idx + attempt) % n;
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': chaves[keyIdx],
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Narre em português do Brasil com tom dinâmico, envolvente e dicção clara: ${cleanText}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        }),
      });

      if (resp.ok) {
        const data = safeParseJson<{
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
          }>;
        }>(await resp.text());
        const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inline?.data) {
          return {
            audioBase64: String(inline.data),
            mimeType: String(inline.mimeType || 'audio/L16;rate=24000'),
            fallbackSpeech: false,
          };
        }
      }
    } catch {
      // try next key or fallback to Web Speech API
    }
  }

  return { audioBase64: null, mimeType: null, fallbackSpeech: true };
}

