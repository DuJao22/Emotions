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
  STYLES,
  TRANSITIONS,
  TransitionKind,
} from '../types/showreel';

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
      const data = await resp.json();
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
    temperature = 0.9,
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

      const data = await resp.json();
      const parts: Array<{ text?: string; thought?: boolean }> =
        data.candidates?.[0]?.content?.parts || [];
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
    reaproveitar = 0.25,
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

  const estiloCand = STYLES.filter((s) => !ultimos.map((r) => r.estilo).includes(s.name));
  const chosenStyle = rngChoice(estiloCand.length ? estiloCand : STYLES);

  let hue = Math.random();
  if (runs.length > 0) {
    const lastHue = Number(runs[runs.length - 1].hue || 0);
    for (let i = 0; i < 30; i++) {
      if (Math.abs(hue - lastHue) > 0.15) break;
      hue = Math.random();
    }
  }
  const off = rngChoice([0.5, 0.12, 0.33]);
  const dna: DNA = {
    structure,
    transition,
    estilo: chosenStyle.name,
    estilo_desc: chosenStyle.desc,
    pal: {
      bg1: hsl_hex(hue, 0.55, 0.045),
      bg2: hsl_hex(hue + 0.05, 0.6, 0.15),
      acc: hsl_hex(hue + off, 0.9, 0.58),
      acc2: hsl_hex(hue + off / 2 + 0.08, 0.85, 0.62),
      fg: '#f5f5f5',
      dim: '#b0b0c0',
    },
    bpm: Math.floor(90 + Math.random() * 51),
    energy: Math.floor(2 + Math.random() * 4),
    hue,
  };

  logs.push(
    `DNA: estilo=${dna.estilo} | estrutura=${dna.structure} | transição=${dna.transition} | bpm=${dna.bpm} | energia=${dna.energy}`
  );

  const chaves = extrairChavesLocal(key1, key2);
  const tem_chave = chaves.length > 0;
  let modelos = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
  const miRef = { mi: 0 };

  if (tem_chave) {
    logs.push(`Chaves Gemini em uso: ${chaves.length} (as cenas alternam entre elas)`);
    const prep = await descobrirModelosLocal(key1, key2, geminiModel);
    modelos = prep.modelos;
    logs.push(...prep.logs);
  }

  let rawPlan: { title?: string; scenes?: Array<Record<string, unknown>> } | null = null;

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
      try {
        let txt = gem.text.trim().replace(/^`+|`+$/g, '').trim();
        if (txt.toLowerCase().startsWith('json')) txt = txt.slice(4).trim();
        const parsed = JSON.parse(txt);
        if (parsed && Array.isArray(parsed.scenes)) rawPlan = parsed;
      } catch {
        rawPlan = null;
      }
    }
  }

  if (!rawPlan) {
    logs.push(
      !tem_chave ? 'Modo offline (cenas prontas).' : 'Gemini falhou no roteiro - usando roteiro offline.'
    );
    const words = prompt
      .toUpperCase()
      .replace(/,/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 12);
    if (!words.length) words.push('MOTION');
    const ideias = ['MOVIMENTO', 'RITMO', 'IMPACTO', 'DETALHE', 'ENERGIA', 'FLUXO', 'FOCO'];
    const scs: Array<Record<string, unknown>> = [
      { role: 'hook', text: words.slice(0, 4).join(' '), sub: 'showreel', idea: '', weight: 2 },
    ];
    for (let i = 1; i < 7; i++) {
      scs.push({
        role: i === 5 ? 'climax' : 'body',
        text: rngChoice(ideias) + (i % 2 ? ' ' + words[i % words.length] : ''),
        sub: '',
        idea: '',
        weight: rngChoice([1, 1, 2]),
      });
    }
    scs.push({
      role: 'closing',
      text: words.slice(0, 3).join(' '),
      sub: 'obrigado',
      idea: '',
      weight: 2,
    });
    rawPlan = { title: words.slice(0, 3).join(' '), scenes: scs };
  }

  const rawScenes = (rawPlan.scenes || []).slice(0, 10).map((s) => {
    const r = String(s.role || 'body') as SceneRole;
    return {
      role: (ROLES.includes(r) ? r : 'body') as SceneRole,
      text: String(s.text || 'MOTION').slice(0, 40),
      sub: String(s.sub || '').slice(0, 60),
      idea: String(s.idea || '').slice(0, 300),
      weight: Number(s.weight) || 1,
      fb: 'kinetic' as FallbackKind,
    };
  });

  if (!rawScenes.length) {
    rawScenes.push({ role: 'hook', text: 'MOTION', sub: '', idea: '', weight: 1, fb: 'kinetic' });
  }
  if (rawScenes.length === 1) {
    rawScenes.push({ role: 'closing', text: 'FIM', sub: '', idea: '', weight: 1, fb: 'closing' });
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
          ? 0.7
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
    if (reuso.length > 0 && Math.random() < reaproveitar) {
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

    return {
      ...s,
      dur,
      start,
      seed,
      code: null,
      origem: 'fallback',
      status: tem_chave ? 'compiling' : 'ready',
    };
  });

  const title = String(rawPlan.title || 'Showreel').slice(0, 60);
  logs.push(`Roteiro '${title}': ${scenes.length} cenas`);

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
  dna: DNA;
  scene: SceneSpec;
  idx: number;
  total: number;
  anterior: string;
  width: number;
  height: number;
  key1?: string;
  key2?: string;
  modelos: string[];
  mi: number;
}): Promise<{ code: string | null; origem: 'gemini' | 'fallback'; mi: number; logs: string[] }> {
  const { dna, scene, idx, total, anterior, width, height, key1, key2, modelos, mi } = params;
  const logs: string[] = [];
  const chaves = extrairChavesLocal(key1, key2);
  if (!chaves.length) {
    return { code: null, origem: 'fallback', mi, logs };
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
- Cena ${idx + 1} de ${total}, papel: ${scene.role}. Duração aprox. ${scene.dur.toFixed(1)}s.
- Ideia visual desta cena: ${scene.idea || 'livre, coerente com o estilo'}
- Cena anterior (NÃO repita): ${anterior || 'nenhuma'}
Exemplo do FORMATO esperado (corpo da função, outra ideia):
${EXEMPLO}
Agora escreva o corpo da função da cena.`;

  const miRef = { mi };
  const gem = await geminiLocalCall({
    prompt: p,
    chaves,
    modelos,
    miRef,
    temperature: 0.95,
    chave: idx,
  });
  logs.push(...gem.logs);

  if (!gem.text) {
    logs.push('    sem código válido -> cena pronta (fallback)');
    return { code: null, origem: 'fallback', mi: miRef.mi, logs };
  }

  const m = gem.text.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  const code = (m ? m[1] : gem.text).trim().replace(/^`+|`+$/g, '').trim();

  if (code.length < 40 || code.length > 16000 || PROIBIDO.some((b) => code.includes(b))) {
    logs.push('    sem código válido -> cena pronta (fallback)');
    return { code: null, origem: 'fallback', mi: miRef.mi, logs };
  }

  const biblioteca = lerLocal<Array<Record<string, unknown>>>('biblioteca_cenas', []);
  biblioteca.push({
    role: scene.role,
    idea: scene.idea,
    estilo: dna.estilo,
    code,
  });
  gravarLocal('biblioteca_cenas', biblioteca.slice(-80));

  return { code, origem: 'gemini', mi: miRef.mi, logs };
}
