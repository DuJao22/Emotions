import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Video,
  Download,
  Settings,
  Sparkles,
  Terminal,
  Code2,
  FileCode,
  Check,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { INITIAL_SHOWREEL, SceneSpec, ShowreelData } from './types/showreel';
import {
  MotionLib,
  FallbackEngines,
  SceneDrawFn,
  ScenePaintContext,
  compileSceneCode,
  resetCanvasCtx,
  pulseAt,
  compositeTransition,
  buildJsBundle,
  buildStandaloneHtml,
} from './engine/motionEngine';
import { ShowreelAudioSynth } from './engine/audioSynth';

interface CompiledScene extends SceneSpec {
  fn: SceneDrawFn;
  start: number;
}

const TR = 0.32;

export default function App() {
  // ====================== CONFIGURAÇÃO (Persistida no navegador) ======================
  const [key1, setKey1] = useState<string>(() => localStorage.getItem('GEMINI_API_KEY_1') || '');
  const [key2, setKey2] = useState<string>(() => localStorage.getItem('GEMINI_API_KEY_2') || '');
  const [geminiModel, setGeminiModel] = useState<string>(
    () => localStorage.getItem('GEMINI_MODEL') || 'auto'
  );
  const [durationConfig, setDurationConfig] = useState<number>(
    () => Number(localStorage.getItem('DURATION')) || 30
  );
  const [resConfig, setResConfig] = useState<'720x1280' | '540x960'>(
    () => (localStorage.getItem('RES_CONFIG') as '720x1280' | '540x960') || '720x1280'
  );
  const [reaproveitarConfig, setReaproveitarConfig] = useState<number>(
    () => Number(localStorage.getItem('REAPROVEITAR') ?? 0.25)
  );
  const [pausaConfig, setPausaConfig] = useState<number>(
    () => Number(localStorage.getItem('PAUSA_ENTRE_CHAMADAS') ?? 1.5)
  );

  // UI Modals / Drawers
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [showKey1, setShowKey1] = useState<boolean>(false);
  const [showKey2, setShowKey2] = useState<boolean>(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discoveringModels, setDiscoveringModels] = useState<boolean>(false);
  const [logExpanded, setLogExpanded] = useState<boolean>(false);
  const [editingSceneIdx, setEditingSceneIdx] = useState<number | null>(null);
  const [draftSceneCode, setDraftSceneCode] = useState<string>('');

  // Prompt & Showreel State
  const [promptText, setPromptText] = useState<string>('');
  const [data, setData] = useState<ShowreelData>(INITIAL_SHOWREEL);
  const [logs, setLogs] = useState<string[]>(() => {
    const d = INITIAL_SHOWREEL;
    const initialLogs = [
      `DNA: ${d.dna.structure} | ${d.dna.transition} | ${d.dna.estilo} | ${d.dna.bpm} bpm | energia ${d.dna.energy}`,
    ];
    d.scenes.forEach((s, i) => {
      initialLogs.push(`${i + 1}. [${s.role}] ${s.text}  (${s.origem}, ${s.dur.toFixed(1)}s)`);
    });
    return initialLogs;
  });

  // Generation Pipeline State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [genProgressLabel, setGenProgressLabel] = useState<string>('');
  const abortGenRef = useRef<boolean>(false);

  // Player & Canvas Refs
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const coRef = useRef<HTMLCanvasElement | null>(null);
  const cnRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<ShowreelAudioSynth | null>(null);

  const [playing, setPlaying] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [gtState, setGtState] = useState<number>(0);
  const [currentSceneIdx, setCurrentSceneIdx] = useState<number>(0);
  const [recording, setRecording] = useState<boolean>(false);
  const [downloadVideo, setDownloadVideo] = useState<{
    url: string;
    name: string;
    ext: string;
    sizeMb: string;
  } | null>(null);

  const playingRef = useRef<boolean>(false);
  const gtRef = useRef<number>(0);
  const t0Ref = useRef<number>(0);
  const lastHalfRef = useRef<number>(-1);
  const lastSceneRef = useRef<number>(-1);
  const compiledScenesRef = useRef<CompiledScene[]>([]);
  const mrRef = useRef<MediaRecorder | null>(null);
  const recordingRef = useRef<boolean>(false);

  const appendLog = useCallback((msg: string | string[]) => {
    const lines = Array.isArray(msg) ? msg : [msg];
    setLogs((prev) => [...prev, ...lines]);
  }, []);

  // Save settings to localStorage
  const saveSettings = () => {
    localStorage.setItem('GEMINI_API_KEY_1', key1.trim());
    localStorage.setItem('GEMINI_API_KEY_2', key2.trim());
    localStorage.setItem('GEMINI_MODEL', geminiModel.trim() || 'auto');
    localStorage.setItem('DURATION', String(durationConfig));
    localStorage.setItem('RES_CONFIG', resConfig);
    localStorage.setItem('REAPROVEITAR', String(reaproveitarConfig));
    localStorage.setItem('PAUSA_ENTRE_CHAMADAS', String(pausaConfig));
    setSettingsOpen(false);
  };

  // Discover models from Gemini API using key1/key2 (exatamente como descobrir_modelos() no Python)
  const handleDiscoverModels = async () => {
    setDiscoveringModels(true);
    try {
      const res = await fetch('/api/agent/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key1: key1.trim(),
          key2: key2.trim(),
          modelPref: geminiModel,
        }),
      });
      const out = await res.json();
      if (Array.isArray(out.modelos)) {
        setDiscoveredModels(out.modelos);
      }
      if (Array.isArray(out.logs)) {
        appendLog(out.logs);
      }
    } catch (e) {
      appendLog(`Erro ao listar modelos: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDiscoveringModels(false);
    }
  };

  // Initialize Audio Synth
  useEffect(() => {
    audioRef.current = new ShowreelAudioSynth();
  }, []);

  // Fit Canvas to #stage maintaining exact W/H aspect ratio (como fitCanvas() do script Python)
  const fitCanvas = useCallback(() => {
    const st = stageRef.current;
    const cv = cvRef.current;
    if (!st || !cv) return;
    const r = data.W / data.H;
    let w = st.clientWidth;
    let h = st.clientHeight;
    if (w <= 0 || h <= 0) return;
    if (w / h > r) {
      w = h * r;
    } else {
      h = w / r;
    }
    cv.style.width = `${Math.floor(w)}px`;
    cv.style.height = `${Math.floor(h)}px`;
  }, [data.W, data.H]);

  useEffect(() => {
    fitCanvas();
    window.addEventListener('resize', fitCanvas);
    return () => window.removeEventListener('resize', fitCanvas);
  }, [fitCanvas, logExpanded]);

  // Compile scenes & run pre-flight test at [.05, .5, .95] (>120ms/frame degrades to fallback)
  useEffect(() => {
    const W = data.W;
    const H = data.H;
    if (!coRef.current) coRef.current = document.createElement('canvas');
    if (!cnRef.current) cnRef.current = document.createElement('canvas');
    coRef.current.width = cnRef.current.width = W;
    coRef.current.height = cnRef.current.height = H;
    const cxn = cnRef.current.getContext('2d');

    let acc = 0;
    const sc: CompiledScene[] = data.scenes.map((s, i) => {
      let fn: SceneDrawFn | null = null;
      let origem = s.origem;
      if (s.code) {
        try {
          fn = compileSceneCode(s.code);
          origem = s.origem || 'gemini';
        } catch (e) {
          fn = null;
          origem = 'fallback';
          appendLog(
            `cena ${i + 1}: erro de sintaxe -> fallback (${
              e instanceof Error ? e.message : String(e)
            })`
          );
        }
      }
      if (!fn) {
        fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
      }
      const start = acc;
      acc += s.dur;
      return {
        ...s,
        fn,
        origem,
        start,
      };
    });

    if (cxn) {
      sc.forEach((s, i) => {
        try {
          const t0 = performance.now();
          [0.05, 0.5, 0.95].forEach((f) => {
            const ts = s.dur * f;
            const gt = s.start + ts;
            resetCanvasCtx(cxn);
            const P: ScenePaintContext = {
              pal: data.dna.pal,
              bpm: data.dna.bpm,
              energy: data.dna.energy,
              text: s.text,
              sub: s.sub,
              role: s.role,
              dur: s.dur,
              seed: s.seed,
              pulse: pulseAt(gt, data.dna.bpm, data.dna.energy),
              gt,
              i,
            };
            MotionLib.bg(cxn, W, H, P, i);
            s.fn(cxn, MotionLib.clamp(ts / s.dur), ts, W, H, P, MotionLib);
            MotionLib.sub(cxn, W, H, P, ts);
          });
          const ms = (performance.now() - t0) / 3;
          if (ms > 120) {
            appendLog(`cena ${i + 1}: muito pesada (${Math.round(ms)} ms/frame) -> fallback`);
            s.fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
            s.origem = 'fallback';
          }
        } catch (e) {
          appendLog(
            `cena ${i + 1}: ${e instanceof Error ? e.message : String(e)} -> fallback`
          );
          s.fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
          s.origem = 'fallback';
        }
      });
    }

    compiledScenesRef.current = sc;
    fitCanvas();
  }, [data, appendLog, fitCanvas]);

  const paint = useCallback(
    (c: CanvasRenderingContext2D, i: number, ts: number, gt: number) => {
      const sc = compiledScenesRef.current;
      if (!sc.length) return;
      const s = sc[Math.max(0, Math.min(sc.length - 1, i))];
      const W = data.W;
      const H = data.H;
      resetCanvasCtx(c);
      const P: ScenePaintContext = {
        pal: data.dna.pal,
        bpm: data.dna.bpm,
        energy: data.dna.energy,
        text: s.text,
        sub: s.sub,
        role: s.role,
        dur: s.dur,
        seed: s.seed,
        pulse: pulseAt(gt, data.dna.bpm, data.dna.energy),
        gt,
        i,
      };
      MotionLib.bg(c, W, H, P, i);
      try {
        s.fn(c, MotionLib.clamp(ts / s.dur), ts, W, H, P, MotionLib);
      } catch (e) {
        appendLog(
          `cena ${i + 1}: ${e instanceof Error ? e.message : String(e)} -> fallback`
        );
        s.fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
        s.origem = 'fallback';
        resetCanvasCtx(c);
        MotionLib.bg(c, W, H, P, i);
        s.fn(c, MotionLib.clamp(ts / s.dur), ts, W, H, P, MotionLib);
      }
      try {
        MotionLib.sub(c, W, H, P, ts);
      } catch {
        // ignore
      }
    },
    [data, appendLog]
  );

  const frame = useCallback(
    (gtInput: number): number => {
      const cv = cvRef.current;
      const co = coRef.current;
      const cn = cnRef.current;
      const sc = compiledScenesRef.current;
      if (!cv || !co || !cn || !sc.length) return 0;

      const ctx = cv.getContext('2d');
      const cxo = co.getContext('2d');
      const cxn = cn.getContext('2d');
      if (!ctx || !cxo || !cxn) return 0;

      const DUR = data.duration;
      const W = data.W;
      const H = data.H;
      const gt = MotionLib.clamp(gtInput, 0, DUR - 1e-3);

      let i = 0;
      while (i < sc.length - 1 && gt >= sc[i + 1].start) i++;
      const ts = gt - sc[i].start;

      if (i > 0 && ts < TR) {
        paint(cxn, i, ts, gt);
        paint(cxo, i - 1, sc[i - 1].dur + ts, gt);
        compositeTransition(ctx, co, cn, data.dna.transition, ts / TR, W, H, data.dna.pal);
      } else {
        paint(ctx, i, ts, gt);
      }

      const f = gt < 0.4 ? 1 - gt / 0.4 : gt > DUR - 0.5 ? 1 - (DUR - gt) / 0.5 : 0;
      if (f > 0) {
        ctx.fillStyle = `rgba(0,0,0,${MotionLib.clamp(f)})`;
        ctx.fillRect(0, 0, W, H);
      }
      return i;
    },
    [data, paint]
  );

  const stopRec = useCallback(() => {
    if (mrRef.current && mrRef.current.state !== 'inactive') {
      mrRef.current.stop();
    }
  }, []);

  // Main requestAnimationFrame loop (idêntico ao tick() do HTML original)
  useEffect(() => {
    let rafId = 0;
    let lastHudUpdate = 0;

    const tick = (now: number) => {
      const DUR = data.duration;
      if (playingRef.current) {
        gtRef.current = (now - t0Ref.current) / 1000;
        if (gtRef.current >= DUR) {
          gtRef.current = DUR - 1e-3;
          playingRef.current = false;
          setPlaying(false);
          if (recordingRef.current) {
            setTimeout(stopRec, 500);
          }
        }
      }

      const i = frame(gtRef.current);

      if (playingRef.current && audioRef.current) {
        const h = Math.floor(((gtRef.current * data.dna.bpm) / 60) * 2);
        if (h !== lastHalfRef.current) {
          lastHalfRef.current = h;
          if (h % 2 === 0) audioRef.current.kick();
          else audioRef.current.hat();
        }
        if (lastSceneRef.current >= 0 && i !== lastSceneRef.current) {
          audioRef.current.whoosh();
        }
      }
      lastSceneRef.current = i;

      if (now - lastHudUpdate > 50) {
        lastHudUpdate = now;
        setGtState(gtRef.current);
        setCurrentSceneIdx(i);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [data.duration, data.dna.bpm, frame, stopRec]);

  const play = async () => {
    await audioRef.current?.resume();
    if (gtRef.current >= data.duration - 0.02) {
      gtRef.current = 0;
    }
    t0Ref.current = performance.now() - gtRef.current * 1000;
    playingRef.current = true;
    lastHalfRef.current = -1;
    setPlaying(true);
    try {
      if ('wakeLock' in navigator && navigator.wakeLock) {
        await navigator.wakeLock.request('screen');
      }
    } catch {
      // ignore wakeLock errors
    }
  };

  const pause = () => {
    playingRef.current = false;
    setPlaying(false);
  };

  const handleRestart = () => {
    gtRef.current = 0;
    if (playingRef.current) {
      t0Ref.current = performance.now();
    }
    lastHalfRef.current = -1;
    setGtState(0);
    setCurrentSceneIdx(0);
  };

  const handleToggleSound = async () => {
    await audioRef.current?.resume();
    const nextMuted = !muted;
    audioRef.current?.setMuted(nextMuted);
    setMuted(nextMuted);
  };

  const handleSeek = (val: number) => {
    pause();
    const nextGt = (val / 1000) * data.duration;
    gtRef.current = nextGt;
    setGtState(nextGt);
    const i = frame(nextGt);
    setCurrentSceneIdx(i);
  };

  const startRec = async () => {
    if (recordingRef.current || !cvRef.current) return;
    await audioRef.current?.resume();
    const types = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeT =
      (typeof MediaRecorder !== 'undefined' &&
        types.find((t) => MediaRecorder.isTypeSupported(t))) ||
      '';
    if (!mimeT) {
      appendLog('Este navegador não suporta gravação. Use o Chrome atualizado.');
      return;
    }

    const stream = cvRef.current.captureStream(30);
    const audioTracks = audioRef.current?.getAudioTracks() || [];
    audioTracks.forEach((t) => stream.addTrack(t));

    const chunks: BlobPart[] = [];
    const mr = new MediaRecorder(stream, {
      mimeType: mimeT,
      videoBitsPerSecond: 8000000,
    });
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    mr.onstop = () => {
      const ext = mimeT.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mimeT.split(';')[0] });
      const url = URL.createObjectURL(blob);
      const name = `showreel_${Date.now()}.${ext}`;
      const sizeMb = (blob.size / 1e6).toFixed(1);
      setDownloadVideo({ url, name, ext: ext.toUpperCase(), sizeMb });
      recordingRef.current = false;
      setRecording(false);
      appendLog(`gravação pronta: ${ext}`);

      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    mrRef.current = mr;
    recordingRef.current = true;
    setRecording(true);
    setDownloadVideo(null);
    gtRef.current = 0;
    mr.start(500);
    await play();
  };

  const saveCode = () => {
    const out = buildJsBundle(data);
    const b = new Blob([out], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `showreel_codigo_${Date.now()}.js`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    appendLog('código salvo (download)');
  };

  const saveHtml = () => {
    const html = buildStandaloneHtml(data);
    const b = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `showreel_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    appendLog('HTML standalone salvo (download)');
  };

  // ====================== FLUXO EXATO DO AGENTE PYTHON (Roteiro -> Cena por Cena alternando Chaves) ======================
  const handleRunAgent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isGenerating) return;

    setIsGenerating(true);
    abortGenRef.current = false;
    const [W, H] = resConfig === '540x960' ? [540, 960] : [720, 1280];
    const userPrompt = promptText.trim() || 'showreel de motion design moderno';

    setLogs([`Iniciando Showreel Agent para: "${userPrompt}"...`]);
    setGenProgressLabel('1/2 · Criando roteiro e DNA...');

    try {
      // Passo 1: pedir_roteiro (1 chamada na chave 1)
      const planRes = await fetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          key1: key1.trim(),
          key2: key2.trim(),
          geminiModel: geminiModel.trim() || 'auto',
          duration: durationConfig,
          width: W,
          height: H,
          reaproveitar: reaproveitarConfig,
        }),
      });

      const planData = await planRes.json();
      if (Array.isArray(planData.logs)) {
        appendLog(planData.logs);
      }

      let currentReel: ShowreelData = planData.showreel;
      const modelos: string[] = planData.modelos || [
        'gemini-3.1-flash-lite',
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
      ];
      let currentMi: number = planData.mi || 0;
      const temChave: boolean = Boolean(planData.tem_chave);

      // Carrega o roteiro imediatamente no Canvas (com fallbacks/biblioteca enquanto compila cada cena)
      setData(currentReel);
      gtRef.current = 0;
      t0Ref.current = performance.now();
      await play();

      // Passo 2: pedir_cena para cada cena (alternando entre Chave 1 e Chave 2, com PAUSA_ENTRE_CHAMADAS)
      if (temChave) {
        let anterior = '';
        let novos = 0;
        const total = currentReel.scenes.length;

        for (let i = 0; i < total; i++) {
          if (abortGenRef.current) break;
          const s = currentReel.scenes[i];

          if (s.origem === 'biblioteca' && s.code) {
            anterior = s.idea || s.text;
            continue;
          }

          const activeKeyNum = key2.trim() && key1.trim() ? (i % 2) + 1 : 1;
          setGenProgressLabel(
            `Cena ${i + 1}/${total} [${s.role}] · Chave ${activeKeyNum}...`
          );

          const sceneRes = await fetch('/api/agent/scene', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dna: currentReel.dna,
              scene: s,
              idx: i,
              total,
              anterior,
              width: W,
              height: H,
              key1: key1.trim(),
              key2: key2.trim(),
              modelos,
              mi: currentMi,
            }),
          });

          const sceneOut = await sceneRes.json();
          if (Array.isArray(sceneOut.logs)) {
            appendLog(sceneOut.logs);
          }
          if (typeof sceneOut.mi === 'number') {
            currentMi = sceneOut.mi;
          }

          if (sceneOut.code) {
            novos += 1;
            currentReel = {
              ...currentReel,
              scenes: currentReel.scenes.map((scItem, idx) =>
                idx === i
                  ? { ...scItem, code: sceneOut.code, origem: 'gemini', status: 'ready' }
                  : scItem
              ),
            };
            setData(currentReel);
          } else {
            currentReel = {
              ...currentReel,
              scenes: currentReel.scenes.map((scItem, idx) =>
                idx === i ? { ...scItem, status: 'ready' } : scItem
              ),
            };
            setData(currentReel);
          }

          anterior = s.idea || s.text;

          // Pausa configurável entre chamadas para respeitar limite gratuito
          if (i < total - 1 && pausaConfig > 0) {
            await new Promise((r) => setTimeout(r, pausaConfig * 1000));
          }
        }

        appendLog(
          `\nPRONTO! ${currentReel.scenes.length} cenas (${novos} novas do Gemini).`
        );
      } else {
        appendLog(
          `\nPRONTO! ${currentReel.scenes.length} cenas em modo offline (abra a ⚙️ Engrenagem para colar suas 2 chaves da Gemini).`
        );
      }
    } catch (err) {
      appendLog(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
      setGenProgressLabel('');
    }
  };

  const activeScene =
    compiledScenesRef.current[currentSceneIdx] || data.scenes[currentSceneIdx] || data.scenes[0];
  const configuredKeysCount = [key1.trim(), key2.trim()].filter(Boolean).length;

  return (
    <div className="h-[100dvh] w-full bg-[#07070b] text-[#eee] flex flex-col items-center p-2.5 sm:p-4 box-border gap-2.5 overflow-hidden select-none">
      {/* #top: Barra Superior Minimalista + Botão da Engrenagem ⚙️ para as 2 Chaves */}
      <header className="w-full max-w-2xl flex items-center justify-between gap-2 text-xs sm:text-sm shrink-0">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <b className="text-sm sm:text-base font-bold text-white truncate">
            {data.title}
          </b>
          <span className="opacity-70 font-mono text-[11px] sm:text-xs tabular-nums truncate">
            {recording ? '● GRAVANDO  ' : ''}
            {gtState.toFixed(1)}s / {data.duration}s · cena {currentSceneIdx + 1}/
            {data.scenes.length} ({activeScene?.origem || 'fallback'})
          </span>
        </div>

        {/* Botão da Engrenagem (Chave 1 e Chave 2 da Gemini) */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Configurar Chave 1 e Chave 2 da Gemini"
          className="min-h-[40px] px-3 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-xs font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform shrink-0"
        >
          <Settings className="w-4 h-4 text-[#e11d48]" />
          <span>
            {configuredKeysCount > 0
              ? `${configuredKeysCount} Chave${configuredKeysCount > 1 ? 's' : ''}`
              : 'Chaves API'}
          </span>
        </button>
      </header>

      {/* Barra de Prompt Direta (Mobile-First Minimalista) */}
      <form
        onSubmit={handleRunAgent}
        className="w-full max-w-2xl flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Descreva o showreel (ex: tipografia cinética neon, 3D futurista)..."
          className="flex-1 h-11 px-3.5 rounded-xl bg-[#12121c] border border-[#2c2c40] focus:border-[#e11d48] focus:outline-none text-xs sm:text-sm text-white placeholder:text-white/40"
        />
        <button
          type="submit"
          disabled={isGenerating}
          className="h-11 px-4 rounded-xl bg-[#e11d48] hover:bg-[#be123c] disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap shrink-0"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="max-w-[140px] sm:max-w-none truncate">
                {genProgressLabel || 'Gerando...'}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Gerar</span>
            </>
          )}
        </button>
      </form>

      {/* #stage: Palco 9:16 Responsivo de Alta Performance */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 w-full max-w-2xl flex justify-center items-center relative"
      >
        <canvas
          ref={cvRef}
          width={data.W}
          height={data.H}
          onClick={() => (playing ? pause() : play())}
          className="bg-black rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.75)] border border-white/10 cursor-pointer"
        />
      </div>

      {/* #seek: Scrubber + Seletores Rápidos de Cena */}
      <div className="w-full max-w-2xl space-y-1.5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {data.scenes.map((s, idx) => {
            const isCur = idx === currentSceneIdx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  const sc = compiledScenesRef.current[idx];
                  if (sc) {
                    gtRef.current = sc.start + 0.01;
                    if (playingRef.current) {
                      t0Ref.current = performance.now() - gtRef.current * 1000;
                    }
                    setGtState(gtRef.current);
                    frame(gtRef.current);
                    setCurrentSceneIdx(idx);
                  }
                }}
                onDoubleClick={() => {
                  setEditingSceneIdx(idx);
                  setDraftSceneCode(s.code || '');
                }}
                className={`h-6 px-2 rounded-md font-mono text-[11px] tabular-nums flex items-center gap-1 transition-colors shrink-0 border ${
                  isCur
                    ? 'bg-[#e11d48] text-white border-[#e11d48] font-semibold'
                    : s.status === 'compiling'
                    ? 'bg-[#1b1b28] text-[#f59e0b] border-[#f59e0b]/40'
                    : 'bg-[#12121c] text-white/60 border-[#252538] hover:text-white'
                }`}
              >
                <span>{idx + 1}</span>
                <span className="opacity-75">{s.role}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setEditingSceneIdx(currentSceneIdx);
              setDraftSceneCode(data.scenes[currentSceneIdx]?.code || '');
            }}
            className="ml-auto h-6 px-2.5 rounded-md bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-[11px] text-white/80 flex items-center gap-1 shrink-0"
          >
            <Code2 className="w-3 h-3 text-[#f59e0b]" />
            <span>Editar Cena {currentSceneIdx + 1}</span>
          </button>
        </div>

        <input
          type="range"
          id="seek"
          min={0}
          max={1000}
          value={Math.round((gtState / data.duration) * 1000)}
          onChange={(e) => handleSeek(Number(e.target.value))}
          className="w-full studio-slider"
        />
      </div>

      {/* #bar: Barra de Controles Fiel ao Script Original + Ergonomia Mobile */}
      <div
        id="bar"
        className="w-full max-w-2xl flex flex-wrap justify-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={() => (playing ? pause() : play())}
          className="min-h-[44px] px-4 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{playing ? 'Pausar' : 'Play'}</span>
        </button>

        <button
          type="button"
          onClick={handleRestart}
          title="Reiniciar"
          className="min-h-[44px] px-3.5 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-sm font-medium text-white flex items-center justify-center active:scale-95 transition-transform"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleSound}
          className="min-h-[44px] px-3.5 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          {muted ? (
            <VolumeX className="w-4 h-4 text-white/50" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#f59e0b]" />
          )}
          <span>{muted ? 'Mudo' : 'Som'}</span>
        </button>

        <button
          type="button"
          onClick={recording ? stopRec : startRec}
          disabled={recording}
          className="min-h-[44px] px-4 rounded-xl bg-[#8a1030] hover:bg-[#a31439] disabled:opacity-60 border border-[#c0284d] text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Video className="w-4 h-4" />
          <span>{recording ? 'Gravando...' : 'Gravar vídeo'}</span>
        </button>

        <button
          type="button"
          onClick={saveCode}
          className="min-h-[44px] px-3.5 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Download className="w-4 h-4" />
          <span>Salvar código</span>
        </button>

        <button
          type="button"
          onClick={saveHtml}
          title="Baixar arquivo showreel.html standalone idêntico ao Python"
          className="min-h-[44px] px-3.5 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <FileCode className="w-4 h-4 text-[#9496a8]" />
          <span>HTML</span>
        </button>
      </div>

      {/* #dl: Link de Download do Vídeo Gravado */}
      {downloadVideo && (
        <div id="dl" className="shrink-0">
          <a
            href={downloadVideo.url}
            download={downloadVideo.name}
            className="inline-flex items-center gap-2 bg-[#12805a] hover:bg-[#15966a] text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold no-underline shadow-lg"
          >
            <Download className="w-4 h-4" />
            <span>
              Baixar vídeo ({downloadVideo.ext}, {downloadVideo.sizeMb} MB)
            </span>
          </a>
        </div>
      )}

      {/* <details><summary>Cenas / status</summary><pre id="log"></pre></details> */}
      <div className="w-full max-w-2xl bg-[#101018] border border-[#252538] rounded-xl overflow-hidden shrink-0">
        <button
          type="button"
          onClick={() => setLogExpanded((v) => !v)}
          className="w-full px-3.5 py-2 flex items-center justify-between text-xs text-white/80 hover:text-white"
        >
          <span className="flex items-center gap-2 font-medium">
            <Terminal className="w-3.5 h-3.5 text-[#e11d48]" />
            <span>Cenas / status ({logs.length} linhas)</span>
          </span>
          {logExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>
        {logExpanded && (
          <pre
            id="log"
            className="px-3.5 pb-3 pt-1 text-[11px] font-mono text-white/75 whitespace-pre-wrap max-h-[22vh] overflow-y-auto border-t border-[#1e1e2d]"
          >
            {logs.join('\n')}
          </pre>
        )}
      </div>

      {/* ====================== MODAL DA ENGRENAGEM ⚙️ (CHAVE 1 E CHAVE 2 DA GEMINI + CONFIG) ====================== */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#12121c] border-t sm:border border-[#2e2e44] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#252538]">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#e11d48]" />
                <h2 className="text-base font-bold text-white">
                  Configuração do Agente & Chaves Gemini
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-[#1b1b28] flex items-center justify-center text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chave 1 */}
            <div>
              <label className="block text-xs font-semibold text-white/90 mb-1">
                GEMINI_API_KEY_1 (Chave 1 da Gemini)
              </label>
              <div className="relative flex items-center">
                <input
                  type={showKey1 ? 'text' : 'password'}
                  value={key1}
                  onChange={(e) => setKey1(e.target.value)}
                  placeholder="Cole aqui a Chave 1 (vazio = modo offline)"
                  className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-[#07070b] border border-[#2c2c42] focus:border-[#e11d48] focus:outline-none font-mono text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowKey1((v) => !v)}
                  className="absolute right-2.5 text-white/50 hover:text-white"
                >
                  {showKey1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Chave 2 */}
            <div>
              <label className="block text-xs font-semibold text-white/90 mb-1">
                GEMINI_API_KEY_2 (Chave 2 opcional — alterna por cena)
              </label>
              <div className="relative flex items-center">
                <input
                  type={showKey2 ? 'text' : 'password'}
                  value={key2}
                  onChange={(e) => setKey2(e.target.value)}
                  placeholder="Cole aqui a Chave 2 para alternar entre as cenas"
                  className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-[#07070b] border border-[#2c2c42] focus:border-[#e11d48] focus:outline-none font-mono text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowKey2((v) => !v)}
                  className="absolute right-2.5 text-white/50 hover:text-white"
                >
                  {showKey2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-white/55 mt-1">
                Se preencher as duas, a Cena 1 usa a Chave 1, a Cena 2 usa a Chave 2, etc., evitando limite de requisição gratuita.
              </p>
            </div>

            {/* Modelo Gemini + Descobrir Modelos */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-white/90">
                  GEMINI_MODEL (&quot;auto&quot; descobre o melhor da sua chave)
                </label>
                <button
                  type="button"
                  onClick={handleDiscoverModels}
                  disabled={discoveringModels || (!key1.trim() && !key2.trim())}
                  className="text-[11px] text-[#f59e0b] hover:underline disabled:opacity-40 flex items-center gap-1"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${discoveringModels ? 'animate-spin' : ''}`}
                  />
                  <span>Descobrir modelos da chave</span>
                </button>
              </div>
              <input
                type="text"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                placeholder="auto"
                className="w-full h-10 px-3.5 rounded-xl bg-[#07070b] border border-[#2c2c42] focus:border-[#e11d48] focus:outline-none font-mono text-xs text-white"
              />
              {discoveredModels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGeminiModel('auto')}
                    className={`px-2 py-1 rounded-lg text-[11px] font-mono border ${
                      geminiModel === 'auto'
                        ? 'bg-[#e11d48] text-white border-[#e11d48]'
                        : 'bg-[#1b1b28] text-white/75 border-[#33334a]'
                    }`}
                  >
                    auto
                  </button>
                  {discoveredModels.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setGeminiModel(m)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-mono border ${
                        geminiModel === m
                          ? 'bg-[#e11d48] text-white border-[#e11d48]'
                          : 'bg-[#1b1b28] text-white/75 border-[#33334a]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Parâmetros do Script Python: DURATION, WIDTHxHEIGHT, REAPROVEITAR, PAUSA */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#252538]">
              <div>
                <label className="block text-xs text-white/80 mb-1">
                  DURATION (segundos)
                </label>
                <input
                  type="number"
                  min={10}
                  max={90}
                  value={durationConfig}
                  onChange={(e) => setDurationConfig(Number(e.target.value) || 30)}
                  className="w-full h-10 px-3 rounded-xl bg-[#07070b] border border-[#2c2c42] font-mono text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-white/80 mb-1">
                  WIDTH × HEIGHT (9:16)
                </label>
                <select
                  value={resConfig}
                  onChange={(e) =>
                    setResConfig(e.target.value as '720x1280' | '540x960')
                  }
                  className="w-full h-10 px-3 rounded-xl bg-[#07070b] border border-[#2c2c42] font-mono text-xs text-white"
                >
                  <option value="720x1280">720 × 1280 (HD)</option>
                  <option value="540x960">540 × 960 (Celular leve)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-white/80 mb-1">
                  REAPROVEITAR (0 a 1)
                </label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={reaproveitarConfig}
                  onChange={(e) => setReaproveitarConfig(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl bg-[#07070b] border border-[#2c2c42] font-mono text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-white/80 mb-1">
                  PAUSA_ENTRE_CHAMADAS (s)
                </label>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={10}
                  value={pausaConfig}
                  onChange={(e) => setPausaConfig(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl bg-[#07070b] border border-[#2c2c42] font-mono text-xs text-white"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={saveSettings}
                className="w-full h-11 rounded-xl bg-[#e11d48] hover:bg-[#be123c] text-sm font-semibold text-white flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Salvar Configurações</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================== MODAL DE EDIÇÃO DE CENA AO VIVO ====================== */}
      {editingSceneIdx !== null && data.scenes[editingSceneIdx] && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#12121c] border-t sm:border border-[#2e2e44] rounded-t-3xl sm:rounded-2xl p-5 space-y-3 max-h-[88dvh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#252538]">
              <div>
                <span className="text-xs font-mono text-white/60">
                  Cena {editingSceneIdx + 1} [{data.scenes[editingSceneIdx].role}] ·{' '}
                  {data.scenes[editingSceneIdx].origem}
                </span>
                <h3 className="text-sm font-bold text-white">
                  {data.scenes[editingSceneIdx].text}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSceneIdx(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl bg-[#1b1b28] flex items-center justify-center text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              value={draftSceneCode}
              onChange={(e) => setDraftSceneCode(e.target.value)}
              spellCheck={false}
              placeholder="// Corpo da função (ctx, t, ts, W, H, P, M) — vazio usa o fallback"
              className="w-full flex-1 min-h-[220px] p-3 rounded-xl bg-[#07070b] border border-[#2c2c42] font-mono text-xs text-white/90 resize-none focus:border-[#e11d48] focus:outline-none"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const idx = editingSceneIdx;
                  setData((prev) => ({
                    ...prev,
                    scenes: prev.scenes.map((s, i) =>
                      i === idx
                        ? {
                            ...s,
                            code: draftSceneCode.trim() || null,
                            origem: draftSceneCode.trim() ? 'gemini' : 'fallback',
                          }
                        : s
                    ),
                  }));
                  setEditingSceneIdx(null);
                }}
                className="flex-1 h-11 rounded-xl bg-[#e11d48] hover:bg-[#be123c] text-xs font-semibold text-white"
              >
                Aplicar na Cena {editingSceneIdx + 1}
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = editingSceneIdx;
                  setData((prev) => ({
                    ...prev,
                    scenes: prev.scenes.map((s, i) =>
                      i === idx ? { ...s, code: null, origem: 'fallback' } : s
                    ),
                  }));
                  setEditingSceneIdx(null);
                }}
                className="h-11 px-4 rounded-xl bg-[#1b1b28] border border-[#33334a] text-xs text-white/80"
              >
                Usar Fallback ({data.scenes[editingSceneIdx].fb})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
