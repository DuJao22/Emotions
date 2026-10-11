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
import {
  compileSceneCode,
  MotionLib,
  resetCanvasCtx,
  synthesizeConnectedSceneCode,
} from './motionEngine';

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
  const t = String(raw || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  if (!t) return null;
  const i0 = t.indexOf('{');
  const i1 = t.lastIndexOf('}');
  const candidate = i0 >= 0 && i1 > i0 ? t.slice(i0, i1 + 1) : t;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    try {
      // Repara vírgulas finais e quebras de linha não escapadas comuns em respostas de LLMs
      const repaired = candidate
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u0019]+/g, ' ');
      return JSON.parse(repaired) as T;
    } catch {
      return null;
    }
  }
}

export function extrairChavesLocal(key1?: string, key2?: string): string[] {
  const chaves: string[] = [];
  for (const k of [key1 || '', key2 || '']) {
    const clean = k.trim();
    if (clean && clean !== 'MY_GEMINI_API_KEY' && !chaves.includes(clean)) {
      chaves.push(clean);
    }
  }
  return chaves;
}

const PREFERRED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];

const localModelCache = new Map<string, { ts: number; models: string[] }>();

export async function descobrirModelosLocal(
  key1?: string,
  key2?: string,
  modelPref = 'auto'
): Promise<{ chavesCount: number; modelos: string[]; logs: string[] }> {
  const chaves = extrairChavesLocal(key1, key2);
  const padrao = [...PREFERRED_MODELS];
  if (!chaves.length) {
    return {
      chavesCount: 0,
      modelos: padrao,
      logs: ['Modo offline (nenhuma chave informada).'],
    };
  }

  const cacheKey = chaves[0].slice(0, 14);
  const cached = localModelCache.get(cacheKey);
  const nomes: string[] = [];
  const logs: string[] = [];

  if (cached && Date.now() - cached.ts < 20 * 60 * 1000) {
    nomes.push(...cached.models);
  } else {
    let token = '';
    for (let page = 0; page < 3; page++) {
      const url =
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200' +
        (token ? `&pageToken=${encodeURIComponent(token)}` : '');
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(url, {
          headers: { 'x-goog-api-key': chaves[0] },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) {
          logs.push(`  (lista de modelos HTTP ${resp.status} — usando lista prioritária)`);
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
          const isDeprecated =
            nome.startsWith('gemini-1.5') ||
            nome.startsWith('gemini-2.0') ||
            nome.includes('-04-17') ||
            nome.includes('-05-20') ||
            nome.includes('-001');
          if (
            methods.includes('generateContent') &&
            nome.startsWith('gemini-') &&
            nome.includes('flash') &&
            !isDeprecated &&
            !EXCLUI.some((x) => nome.includes(x))
          ) {
            nomes.push(nome);
          }
        }
        token = data.nextPageToken || '';
        if (!token) break;
      } catch {
        break;
      }
    }
    if (nomes.length > 0) {
      localModelCache.set(cacheKey, { ts: Date.now(), models: Array.from(new Set(nomes)) });
    }
  }

  // Prioriza modelos com alta cota gratuita (gemini-2.5-flash, gemini-2.5-flash-lite, gemini-3-flash-preview)
  // antes de modelos com limite restrito de 5 req/min (como gemini-3.8-flash)
  const uniqueDiscovered = Array.from(new Set(nomes));
  const prioritized: string[] = [];
  for (const pref of PREFERRED_MODELS) {
    if (uniqueDiscovered.length === 0 || uniqueDiscovered.includes(pref)) {
      prioritized.push(pref);
    }
  }
  for (const d of uniqueDiscovered) {
    if (!prioritized.includes(d)) {
      prioritized.push(d);
    }
  }
  for (const fallbackModel of PREFERRED_MODELS) {
    if (!prioritized.includes(fallbackModel)) {
      prioritized.push(fallbackModel);
    }
  }

  const base = prioritized.slice(0, 8);
  const modelos =
    modelPref && modelPref.toLowerCase() !== 'auto'
      ? [modelPref, ...base.filter((m) => m !== modelPref)]
      : base;
  logs.push(`Modelo principal: ${modelos[0]} (fallback automático: ${modelos.slice(1, 4).join(', ')})`);

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
    chave = 0,
  } = options;
  const logs: string[] = [];
  if (!chaves.length || !modelos.length) return { text: null, logs };

  const n = chaves.length;
  const maxModelsToTry = Math.min(modelos.length, 4);

  for (let mStep = 0; mStep < maxModelsToTry; mStep++) {
    const modelIdx = (miRef.mi + mStep) % modelos.length;
    const modelo = modelos[modelIdx];
    const supportsZeroThinking = modelo.startsWith('gemini-2.5-flash');

    for (let k = 0; k < n; k++) {
      const idx = (chave + k) % n;
      logs.push(`    (Agente na Chave ${idx + 1}/${n}, modelo ${modelo})`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

      const makeBody = (withThinkingConfig: boolean): Record<string, unknown> => ({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 6144,
          ...(json_mode ? { responseMimeType: 'application/json' } : {}),
          ...(withThinkingConfig ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      });

      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 24000);
        let resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': chaves[idx],
          },
          body: JSON.stringify(makeBody(supportsZeroThinking)),
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        // Se o modelo rejeitar thinkingConfig com 400, tenta imediatamente sem thinkingConfig
        if (resp.status === 400 && supportsZeroThinking) {
          const ctrl2 = new AbortController();
          const timer2 = setTimeout(() => ctrl2.abort(), 24000);
          resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': chaves[idx],
            },
            body: JSON.stringify(makeBody(false)),
            signal: ctrl2.signal,
          });
          clearTimeout(timer2);
        }

        if (!resp.ok) {
          const rawErr = (await resp.text()).slice(0, 800);
          const errJson = safeParseJson<{ error?: { message?: string } }>(rawErr);
          const shortReason = (errJson?.error?.message || rawErr).slice(0, 120);

          if (resp.status === 404 || (resp.status === 429 && /limit:\s*0\b/.test(rawErr))) {
            logs.push(`  Modelo ${modelo} indisponível (${resp.status}). Alternando modelo...`);
            break; // Vai imediatamente para o próximo modelo do loop externo
          }

          if (resp.status === 400 || resp.status === 403) {
            logs.push(`  Aviso Chave ${idx + 1} (${resp.status}): ${shortReason}`);
            continue; // Tenta a outra chave ou próximo modelo
          }

          if (resp.status === 429 || resp.status >= 500) {
            logs.push(
              `  Limite/ocupado na Chave ${idx + 1} (${modelo}, HTTP ${resp.status}). ${
                k < n - 1 ? 'Alternando para a outra Chave...' : 'Trocando para próximo modelo...'
              }`
            );
            await new Promise((r) => setTimeout(r, k < n - 1 ? 600 : 900));
            continue;
          }

          continue;
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
        if (txt.trim()) {
          miRef.mi = modelIdx;
          return { text: txt, logs };
        }
      } catch (ex) {
        const msg = ex instanceof Error ? ex.message : String(ex);
        logs.push(`  Conexão Gemini (Chave ${idx + 1}): ${msg.slice(0, 90)}`);
        await new Promise((r) => setTimeout(r, 600));
      }
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

  // Extrator inteligente para roteiros estruturados (Cena 1, Aoede, Visual:, Chamada Final, etc.)
  const parseStructuredBlocks = (rawPrompt: string) => {
    const cleaned = rawPrompt.replace(/\r/g, '').trim();
    const rawBlocks = cleaned
      .split(/(?=(?:^|\n)\s*(?:Cena|Bloco|Ato|Parte)\s*(?:\d+|Final|Única)\b)/i)
      .map((b) => b.trim())
      .filter(Boolean);

    const blocksToParse =
      rawBlocks.length >= 2
        ? rawBlocks
        : cleaned
            .split(/\n{2,}|(?=(?:Aoede|Kore|Locução|Narração|Voz)\s*[:(])/i)
            .map((b) => b.trim())
            .filter(Boolean);

    const extracted: Array<{
      text: string;
      sub: string;
      narration: string;
      idea: string;
    }> = [];

    for (const blk of blocksToParse) {
      const noHeader = blk
        .replace(/^(?:Cena|Bloco|Ato|Parte)\s*(?:\d+|Final|Única)?\s*(?:[—–\-:]\s*[^\n"]*)?\n?/i, '')
        .trim();

      const visualMatch = noHeader.match(/\b(?:Visual|Vídeo|Tela|Animação|Cena\s+Visual)\s*:\s*([\s\S]*)$/i);
      const visualRaw = visualMatch ? visualMatch[1].trim() : '';
      const beforeVisual = (visualMatch ? noHeader.slice(0, visualMatch.index) : noHeader)
        .replace(/^(?:Aoede|Kore|Puck|Charon|Locução|Narração|Voz| Áudio)\s*(?:\([^)]*\))?\s*:\s*/i, '')
        .replace(/[“”"]/g, '')
        .trim();

      const calloutMatch = visualRaw.match(
        /\b(?:chamada\s+final|texto\s+na\s+tela|frase\s+final)\s*:\s*([\s\S]*)$/i
      );
      const calloutText = calloutMatch ? calloutMatch[1].replace(/[“”"]/g, '').trim() : '';
      const pureVisual = (calloutMatch ? visualRaw.slice(0, calloutMatch.index) : visualRaw)
        .replace(/[.,;\s]+$/, '')
        .trim();

      const splitSpokenToTextSub = (spoken: string, visualIdea: string) => {
        const cleanSpoken = spoken.replace(/\s+/g, ' ').trim();
        if (!cleanSpoken) return;
        const w = cleanSpoken.split(' ').filter(Boolean);
        let headCount = 4;
        if (w.length <= 5) headCount = Math.max(2, Math.ceil(w.length / 2));
        else if (w.slice(0, 5).join(' ').length <= 36) headCount = 5;
        const txt = w.slice(0, headCount).join(' ').toUpperCase().slice(0, 52);
        const rest = w.slice(headCount).join(' ').slice(0, 155);
        const sub = rest || cleanSpoken.slice(0, 155);
        extracted.push({
          text: txt,
          sub,
          narration: rest ? `${txt}. ${sub}` : txt,
          idea:
            visualIdea ||
            `Composição cinematográfica em movimento ilustrando "${cleanSpoken}" com elementos visuais de alta precisão`,
        });
      };

      if (beforeVisual) {
        splitSpokenToTextSub(
          beforeVisual,
          pureVisual
            ? `${pureVisual}${calloutText ? ` | Destaque visual: ${calloutText}` : ''}`
            : ''
        );
      }
      if (calloutText && (!beforeVisual || blocksToParse.length <= 2)) {
        splitSpokenToTextSub(
          calloutText,
          pureVisual || 'Interface premium ao fundo com tipografia monumental em destaque e chamada final'
        );
      }
    }

    return extracted;
  };

  const preParsedScenes = parseStructuredBlocks(prompt);

  if (tem_chave) {
    const evitar =
      runs
        .slice(-4)
        .map((r) => String(r.title || ''))
        .filter(Boolean)
        .join('; ') || 'nenhum';

    const structuredHint =
      preParsedScenes.length >= 2
        ? `\nROTEIRO PRÉ-IDENTIFICADO NO TEXTO DO CLIENTE (${preParsedScenes.length} blocos):\n` +
          preParsedScenes
            .map(
              (s, idx) =>
                `- Bloco ${idx + 1}: Fala="${s.narration}" | Visual="${s.idea}"`
            )
            .join('\n')
        : '';

    const p = `Você é um Diretor Criativo de Motion Design de classe mundial.
Analise profundamente o PEDIDO DO CLIENTE abaixo e crie uma direção de arte 100% ORIGINAL, SEM USAR TEMPLATES PADRÃO, onde o universo visual, a paleta de cores, a narrativa, os layouts e as transições nasçam exclusivamente do que o cliente pediu.

PEDIDO DO CLIENTE: "${prompt}"${structuredHint}
Duração total: ${duration} segundos (formato vertical 9:16, ${width}x${height}).
Evite repetir títulos recentes: ${evitar}.

REGRAS DE DIREÇÃO CRIATIVA E CONEXÃO PROFUNDA:
1. NADA DE ESTRUTURA GENÉRICA: Entenda o produto, tema, emoção ou história do cliente. Crie um "narrative_thread" (fio condutor) que conte uma história contínua da Cena 1 até a última cena. Se o cliente enviou cenas ou falas específicas e descrições de "Visual:", preserve fielmente as falas do cliente e coloque a descrição de "Visual:" no campo "idea" de cada cena!
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
   - NUNCA coloque a palavra "Visual:" ou instruções de câmera dentro de "text", "sub" ou "narration"! As instruções visuais vão APENAS no campo "idea".
   - Em cada cena:
     * "text" é o impacto inicial falado pela voz (2 a 5 palavras em destaque);
     * "sub" é a continuação exata da frase falada pelo narrador naquela cena (5 a 16 palavras);
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

    if (preParsedScenes.length >= 2) {
      const scs = preParsedScenes.slice(0, 9).map((item, i, arr) => {
        const role: SceneRole =
          i === 0 ? 'hook' : i === arr.length - 1 ? 'closing' : i === arr.length - 2 ? 'climax' : 'body';
        return {
          role,
          text: item.text,
          sub: item.sub,
          narration: item.narration,
          idea: item.idea,
          layout_mode: layouts[i % layouts.length],
          camera_motion: cameras[i % cameras.length],
          visual_bridge: `Transição contínua de ${cameras[i % cameras.length]} para a próxima cena`,
          transition_out: transIds[i % transIds.length],
          weight: role === 'hook' || role === 'closing' ? 2 : role === 'climax' ? 2.2 : 1.4,
        };
      });
      rawPlan = { title: preParsedScenes[0].text.slice(0, 32), scenes: scs };
    } else {
      // Se o cliente colou um texto corrido, remove rótulos técnicos "Visual:" da fala e extrai as frases
      const visualMatch = prompt.match(/\bVisual\s*:\s*([\s\S]*)$/i);
      const globalVisualHint = visualMatch ? visualMatch[1].trim() : '';
      const spokenSource = (visualMatch ? prompt.slice(0, visualMatch.index) : prompt)
        .replace(/[“”"]/g, '')
        .trim();

      const calloutInVisual = globalVisualHint.match(
        /\b(?:chamada\s+final|texto\s+na\s+tela)\s*:\s*([\s\S]*)$/i
      );
      const extraSpoken = calloutInVisual ? calloutInVisual[1].replace(/[“”"]/g, '').trim() : '';
      const combinedSpoken = [spokenSource, extraSpoken].filter(Boolean).join('. ');

      const rawChunks = (combinedSpoken || prompt.replace(/[“”"]/g, ''))
        .split(/(?:Cena\s*\d+\s*[:\-–]?|\n+|(?<=[.!?])\s+)/i)
        .map((c) => c.replace(/^(Locução|Narração|Texto|Visual|Aoede|Kore)\s*:\s*/i, '').trim())
        .filter((c) => c.length > 4);

      const words = (combinedSpoken || prompt)
        .toUpperCase()
        .replace(/[,.;:!?\-“”"]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && w !== 'VISUAL')
        .slice(0, 14);
      if (!words.length) words.push('MINI', 'SAAS', 'ELITE');

      const scs: Array<Record<string, unknown>> = [];
      const targetCount = Math.min(8, Math.max(5, rawChunks.length >= 4 ? rawChunks.length : 6));

      for (let i = 0; i < targetCount; i++) {
        const role: SceneRole =
          i === 0 ? 'hook' : i === targetCount - 1 ? 'closing' : i === targetCount - 2 ? 'climax' : 'body';
        const chunk = rawChunks[i % Math.max(1, rawChunks.length)] || '';
        const chunkWords = chunk.split(/\s+/).filter(Boolean);

        let txt = '';
        let sub = '';
        if (chunkWords.length >= 4) {
          txt = chunkWords.slice(0, 4).join(' ').toUpperCase().slice(0, 50);
          sub = chunkWords.slice(4, 22).join(' ').slice(0, 150);
        } else {
          txt = chunk.toUpperCase().slice(0, 50) || `${words[i % words.length]}`;
          sub = rawChunks[(i + 1) % Math.max(1, rawChunks.length)] || 'Desenvolvimento com inteligência artificial';
        }

        scs.push({
          role,
          text: txt,
          sub,
          narration: sub ? `${txt}. ${sub}.` : `${txt}.`,
          idea:
            globalVisualHint ||
            `Cena ${i + 1} ilustrando "${txt} - ${sub}" com interface premium e layout ${layouts[i % layouts.length]}`,
          layout_mode: layouts[i % layouts.length],
          camera_motion: cameras[i % cameras.length],
          visual_bridge: `Transição contínua de ${cameras[i % cameras.length]} para a próxima cena`,
          transition_out: transIds[i % transIds.length],
          weight: role === 'hook' || role === 'closing' ? 2 : role === 'climax' ? 2.2 : 1.4,
        });
      }

      rawPlan = { title: words.slice(0, 4).join(' '), scenes: scs };
    }
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
    // Remove qualquer vazamento de "Visual: ..." de dentro de text, sub ou narration
    const stripVisualMeta = (str: string) =>
      str
        .replace(/\b(?:Visual|Vídeo|Cena\s+Visual)\s*:\s*[\s\S]*$/i, '')
        .replace(/^(?:Aoede|Kore|Locução|Narração|Voz)\s*(?:\([^)]*\))?\s*:\s*/i, '')
        .replace(/[“”"]/g, '')
        .trim();

    const text = (stripVisualMeta(String(s.text || 'MOTION')) || 'MOTION').slice(0, 52);
    let sub = stripVisualMeta(String(s.sub || '')).slice(0, 155);
    let narration = stripVisualMeta(String(s.narration || '')).slice(0, 220);
    if (narration) {
      const normText = text.toLowerCase().replace(/[^a-z0-9à-ú\s]/gi, '').trim();
      const normNarr = narration.toLowerCase().replace(/[^a-z0-9à-ú\s]/gi, '').trim();
      if (normNarr.startsWith(normText) && narration.length > text.length + 2) {
        const remainder = narration
          .slice(text.length)
          .replace(/^[\s.,:;!?\-—]+/, '')
          .trim();
        if (remainder && remainder.length > sub.length) {
          sub = remainder.slice(0, 155);
        }
      } else if (!sub) {
        sub = narration.slice(0, 155);
      }
    }
    if (!sub) sub = 'Experiência visual em movimento contínuo';
    narration = `${text}. ${sub}`;

    return {
      role: (ROLES.includes(r) ? r : 'body') as SceneRole,
      text,
      sub,
      narration,
      idea: String(s.idea || '').slice(0, 460),
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

  const m = gem.text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
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

  // Testa compilação e execução real em Canvas 2D antes de aprovar
  try {
    const fn = compileSceneCode(code);
    if (typeof document !== 'undefined') {
      const testCv = document.createElement('canvas');
      testCv.width = Math.max(90, Math.round(width * 0.25));
      testCv.height = Math.max(160, Math.round(height * 0.25));
      const testCtx = testCv.getContext('2d');
      if (testCtx) {
        resetCanvasCtx(testCtx);
        fn(
          testCtx,
          0.5,
          (scene.dur || 4) * 0.5,
          testCv.width,
          testCv.height,
          {
            pal: dna.pal,
            bpm: dna.bpm,
            energy: dna.energy,
            text: scene.text,
            sub: scene.sub,
            narration: scene.narration,
            role: scene.role,
            dur: scene.dur || 4,
            seed: scene.seed || 12345,
            pulse: 0.4,
            gt: 1.0,
            i: idx,
            layout_mode: scene.layout_mode,
            camera_motion: scene.camera_motion,
            visual_bridge: scene.visual_bridge,
          },
          MotionLib
        );
      }
    }
  } catch (err) {
    logs.push(
      `    erro de execução JS (${err instanceof Error ? err.message : String(err)}) -> usando sintetizador conectado`
    );
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
  logs.push(`    ✓ ${fileName} salvo e validado pelo Agente ${agentNum}`);

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
      reviewNote: 'Inspeção visual concluída.',
      logs,
    };
  }

  // Se os 3 quadros (15%, 50%, 85%) já passaram no teste de movimento e cobertura, aprova sem gastar cota extra de API!
  if (!needsRepair) {
    logs.push(
      `  👁️ Agente ${agentNum} inspecionou ${fileName}: APROVADA (${diagnosticReason})`
    );
    return {
      approved: true,
      repairedCode: null,
      reviewNote: diagnosticReason || 'Animação e tipografia verificadas quadro a quadro.',
      logs,
    };
  }

  const keyIdx = idx % chaves.length;
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
- Subtítulo: "${scene.sub || ''}" (chame M.sub(ctx, W, H, P, ts) no final)
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
    const m = gem.text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
    const code = (m ? m[1] : gem.text).trim().replace(/^`+|`+$/g, '').trim();
    if (code.length >= 40 && code.length <= 16000 && !PROIBIDO.some((b) => code.includes(b))) {
      try {
        compileSceneCode(code);
        logs.push(`    ✓ ${fileName} reconstruída e aprovada pelo Agente ${agentNum}`);
        return {
          approved: true,
          repairedCode: code,
          reviewNote: `Cena reconstruída pelo Agente ${agentNum} após revisão visual.`,
          logs,
        };
      } catch {
        // cai no sintetizador conectado
      }
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

