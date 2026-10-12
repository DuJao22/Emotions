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
  ScanEye,
  FileText,
  CheckCircle2,
  Wrench,
  Mic,
  MicOff,
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
  buildSingleSceneJsFile,
  inspectSceneFrames,
} from './engine/motionEngine';
import { ShowreelAudioSynth } from './engine/audioSynth';
import {
  descobrirModelosLocal,
  extrairChavesLocal,
  fixarChavesPadraoEngrenagem,
  gerarPlanoLocal,
  lerChavesPadraoEngrenagem,
  limparChaveEngrenagem,
  pedirCenaLocal,
  revisarCenaLocal,
  sintetizarVozCenaLocal,
} from './engine/agentRunner';

interface CompiledScene extends SceneSpec {
  fn: SceneDrawFn;
  start: number;
  drawsSub: boolean;
}

const TR = 0.32;

export default function App() {
  // ====================== CONFIGURAÇÃO PADRÃO FIXA NA ENGRENAGEM ⚙️ (Sem depender de variáveis de ambiente) ======================
  const [key1, setKey1] = useState<string>(() => lerChavesPadraoEngrenagem().key1);
  const [key2, setKey2] = useState<string>(() => lerChavesPadraoEngrenagem().key2);
  const [geminiModel, setGeminiModel] = useState<string>(
    () => localStorage.getItem('GEMINI_MODEL') || 'auto'
  );
  const [voiceName, setVoiceName] = useState<string>(
    () => localStorage.getItem('VOICE_NAME') || 'Aoede'
  );
  const [durationConfig, setDurationConfig] = useState<number>(
    () => Number(localStorage.getItem('DURATION')) || 30
  );
  const [resConfig, setResConfig] = useState<'720x1280' | '540x960'>(
    () => (localStorage.getItem('RES_CONFIG') as '720x1280' | '540x960') || '720x1280'
  );
  const [reaproveitarConfig, setReaproveitarConfig] = useState<number>(
    () => Number(localStorage.getItem('REAPROVEITAR') ?? 0.0)
  );
  const [pausaConfig, setPausaConfig] = useState<number>(
    () => Number(localStorage.getItem('PAUSA_ENTRE_CHAMADAS') ?? 0.6)
  );

  // UI Modals / Drawers
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [showKey1, setShowKey1] = useState<boolean>(false);
  const [showKey2, setShowKey2] = useState<boolean>(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discoveringModels, setDiscoveringModels] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<'files' | 'log'>('files');
  const [editingSceneIdx, setEditingSceneIdx] = useState<number | null>(null);
  const [draftSceneCode, setDraftSceneCode] = useState<string>('');

  // Prompt & Showreel State
  const [promptText, setPromptText] = useState<string>(
    () => localStorage.getItem('LAST_PROMPT') || INITIAL_SHOWREEL.prompt || ''
  );
  const [data, setData] = useState<ShowreelData>(INITIAL_SHOWREEL);
  const [logs, setLogs] = useState<string[]>(() => {
    const d = INITIAL_SHOWREEL;
    const initialLogs = [
      `DNA: ${d.dna.structure} | ${d.dna.transition} | ${d.dna.estilo} | ${d.dna.bpm} bpm | energia ${d.dna.energy}`,
    ];
    d.scenes.forEach((s, i) => {
      const ag = (i % 2) + 1;
      initialLogs.push(
        `${i + 1}. [${s.role}] ${s.text}  (Agente ${ag} -> ${
          s.fileName || `cena_0${i + 1}_${s.role}.js`
        }, ${s.dur.toFixed(1)}s)`
      );
    });
    return initialLogs;
  });

  // Generation & Visual Review State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
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
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
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

  const handleKey1Input = (rawVal: string) => {
    const clean = limparChaveEngrenagem(rawVal);
    setKey1(clean || rawVal.trim());
    fixarChavesPadraoEngrenagem(clean || rawVal.trim(), key2);
  };

  const handleKey2Input = (rawVal: string) => {
    const clean = limparChaveEngrenagem(rawVal);
    setKey2(clean || rawVal.trim());
    fixarChavesPadraoEngrenagem(key1, clean || rawVal.trim());
  };

  // Discover models directly from Gemini REST API in browser (compatível 100% com Vercel, Render e Mobile)
  const handleDiscoverModels = async () => {
    setDiscoveringModels(true);
    try {
      const fixed = fixarChavesPadraoEngrenagem(key1, key2);
      const out = await descobrirModelosLocal(fixed.key1, fixed.key2, geminiModel);
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

  // Initialize Audio Synth + Run initial local visual inspection
  useEffect(() => {
    audioRef.current = new ShowreelAudioSynth();
    // Run initial visual inspection on preset scenes so snapshots are ready immediately
    setData((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s, idx) => {
        const check = inspectSceneFrames(s, idx, prev);
        return {
          ...s,
          agentId: ((idx % 2) + 1) as 1 | 2,
          fileName: s.fileName || `cena_${String(idx + 1).padStart(2, '0')}_${s.role}.js`,
          visualCheck: {
            passed: check.passed,
            motionScore: check.motionScore,
            coverageScore: check.coverageScore,
            reviewNote: check.diagnosticReason,
            snapshots: check.snapshots,
          },
        };
      }),
    }));
  }, []);

  // Fit Canvas to #stage maintaining exact W/H aspect ratio
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
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && stageRef.current) {
      ro = new ResizeObserver(() => fitCanvas());
      ro.observe(stageRef.current);
    }
    return () => {
      window.removeEventListener('resize', fitCanvas);
      ro?.disconnect();
    };
  }, [fitCanvas, drawerOpen]);

  // Compile scenes & run pre-flight test at [.05, .5, .95]
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
      const drawsSub = Boolean(s.code && /\b(P\.sub|M\.sub)\b/.test(s.code));
      return {
        ...s,
        fn,
        origem,
        start,
        drawsSub,
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
              layout_mode: s.layout_mode,
              camera_motion: s.camera_motion,
              visual_bridge: s.visual_bridge,
              narration: s.narration || `${s.text}. ${s.sub || ''}`,
            };
            MotionLib.bg(cxn, W, H, P, i);
            s.fn(cxn, MotionLib.clamp(ts / s.dur), ts, W, H, P, MotionLib);
            if (!s.drawsSub) {
              MotionLib.sub(cxn, W, H, P, ts);
            }
          });
          const ms = (performance.now() - t0) / 3;
          if (ms > 120) {
            appendLog(`cena ${i + 1}: muito pesada (${Math.round(ms)} ms/frame) -> fallback`);
            s.fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
            s.origem = 'fallback';
            s.drawsSub = false;
          }
        } catch (e) {
          appendLog(
            `cena ${i + 1}: ${e instanceof Error ? e.message : String(e)} -> fallback`
          );
          s.fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
          s.origem = 'fallback';
          s.drawsSub = false;
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
        layout_mode: s.layout_mode,
        camera_motion: s.camera_motion,
        visual_bridge: s.visual_bridge,
        narration: s.narration || `${s.text}. ${s.sub || ''}`,
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
        s.drawsSub = false;
        resetCanvasCtx(c);
        MotionLib.bg(c, W, H, P, i);
        s.fn(c, MotionLib.clamp(ts / s.dur), ts, W, H, P, MotionLib);
      }
      if (!s.drawsSub) {
        try {
          MotionLib.sub(c, W, H, P, ts);
        } catch {
          // ignore
        }
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
      // Quando pausado em 0.0s, renderiza o quadro de destaque (poster frame em 0.85s da Cena 1)
      // para que o canvas nunca apareça preto ou vazio antes de dar Play!
      const rawTs = gt - sc[i].start;
      const ts =
        !playingRef.current && gt < 0.05
          ? Math.min(sc[0].dur * 0.45, 0.95)
          : rawTs;

      if (i > 0 && ts < TR) {
        paint(cxn, i, ts, gt);
        paint(cxo, i - 1, sc[i - 1].dur + ts, gt);
        const trKind = sc[i - 1].transition_out || data.dna.transition;
        compositeTransition(ctx, co, cn, trKind, ts / TR, W, H, data.dna.pal);
      } else {
        paint(ctx, i, ts, gt);
      }

      const f = gt > DUR - 0.4 ? 1 - (DUR - gt) / 0.4 : 0;
      if (f > 0) {
        ctx.fillStyle = `rgba(0,0,0,${MotionLib.clamp(f * 0.85)})`;
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
        if (i !== lastSceneRef.current) {
          if (lastSceneRef.current >= 0) {
            audioRef.current.whoosh();
          }
          const curSc = compiledScenesRef.current[i];
          if (curSc) {
            const spokenLine =
              curSc.narration ||
              (curSc.sub ? `${curSc.text}. ${curSc.sub}` : curSc.text);
            void audioRef.current.speakScene({
              text: spokenLine,
              voiceAudioBase64: curSc.voiceAudioBase64,
              voiceMimeType: curSc.voiceMimeType,
              sceneDuration: curSc.dur,
            });
          }
        }
        lastSceneRef.current = i;
      }

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
    lastSceneRef.current = -1;
    setPlaying(true);
    try {
      if ('wakeLock' in navigator && navigator.wakeLock) {
        await navigator.wakeLock.request('screen');
      }
    } catch {
      // ignore
    }
  };

  const pause = () => {
    playingRef.current = false;
    audioRef.current?.stopVoice();
    setPlaying(false);
  };

  const handleRestart = () => {
    audioRef.current?.stopVoice();
    gtRef.current = 0;
    if (playingRef.current) {
      t0Ref.current = performance.now();
    }
    lastHalfRef.current = -1;
    lastSceneRef.current = -1;
    setGtState(0);
    setCurrentSceneIdx(0);
  };

  const handleToggleSound = async () => {
    await audioRef.current?.resume();
    const nextMuted = !muted;
    audioRef.current?.setMuted(nextMuted);
    setMuted(nextMuted);
  };

  const handleToggleVoice = async () => {
    await audioRef.current?.resume();
    const nextVoice = !voiceEnabled;
    audioRef.current?.setVoiceEnabled(nextVoice);
    setVoiceEnabled(nextVoice);
    if (nextVoice && playingRef.current) {
      lastSceneRef.current = -1;
    }
  };

  const handleSeek = (val: number) => {
    pause();
    const nextGt = (val / 1000) * data.duration;
    gtRef.current = nextGt;
    lastSceneRef.current = -1;
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

  // Salvar o pacote completo todas_as_cenas.js
  const saveCode = () => {
    const out = buildJsBundle(data);
    const b = new Blob([out], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `todas_as_cenas_${Date.now()}.js`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    appendLog('todas_as_cenas.js salvo (download)');
  };

  // Salvar arquivo individual de uma cena (ex: cena_01_hook.js)
  const downloadSingleSceneFile = (scene: SceneSpec, idx: number) => {
    const { fileName, content } = buildSingleSceneJsFile(scene, idx, data);
    const b = new Blob([content], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    appendLog(`Arquivo individual salvo: ${fileName}`);
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

  // ====================== ETAPA DE REVISÃO VISUAL & AUTO-REPARO PELOS AGENTES ======================
  const runVisualInspectionPass = async (
    reelToInspect: ShowreelData,
    modelos: string[],
    currentMi: number
  ): Promise<ShowreelData> => {
    setIsReviewing(true);
    let workingReel = { ...reelToInspect, scenes: [...reelToInspect.scenes] };
    const total = workingReel.scenes.length;
    const padraoGear = lerChavesPadraoEngrenagem();
    const activeK1 = limparChaveEngrenagem(key1) || padraoGear.key1;
    const activeK2 = limparChaveEngrenagem(key2) || padraoGear.key2;
    const temChave = extrairChavesLocal(activeK1, activeK2).length > 0;

    appendLog('\n=== INICIANDO REVISÃO VISUAL DO SHOWREEL (QUADRO A QUADRO) ===');

    for (let i = 0; i < total; i++) {
      if (abortGenRef.current) break;
      const s = workingReel.scenes[i];
      const agentNum = ((i % 2) + 1) as 1 | 2;
      const numStr = String(i + 1).padStart(2, '0');
      const fileName = s.fileName || `cena_${numStr}_${s.role}.js`;

      setGenProgressLabel(`👁️ Agente ${agentNum} vendo ${fileName} (${i + 1}/${total})...`);

      // 1. Renderiza a cena em 15%, 50% e 85% para o Agente "ver" o que criou
      const frameCheck = inspectSceneFrames(s, i, workingReel);
      const needsRepair = !frameCheck.passed || s.origem === 'fallback' || !s.code;

      let reviewNote = frameCheck.diagnosticReason;
      let repaired = false;
      let currentScene: SceneSpec = {
        ...s,
        agentId: agentNum,
        fileName,
        visualCheck: {
          passed: frameCheck.passed,
          motionScore: frameCheck.motionScore,
          coverageScore: frameCheck.coverageScore,
          reviewNote: frameCheck.diagnosticReason,
          snapshots: frameCheck.snapshots,
          repaired: false,
        },
      };

      // 2. Se houver chave configurada, o Agente Diretor analisa o snapshot real (ou reconstrói a cena se tiver falha/animação faltante)
      if (temChave) {
        const revOut = await revisarCenaLocal({
          prompt: workingReel.prompt || '',
          dna: workingReel.dna,
          scene: s,
          idx: i,
          total,
          width: workingReel.W,
          height: workingReel.H,
          snapshotDataUrl: frameCheck.snapshots[1] || frameCheck.snapshots[0],
          diagnosticReason: frameCheck.diagnosticReason,
          needsRepair,
          key1: activeK1,
          key2: activeK2,
          modelos,
          mi: currentMi,
        });

        if (revOut.logs && revOut.logs.length > 0) {
          appendLog(revOut.logs);
        }
        reviewNote = revOut.reviewNote || reviewNote;

        if (revOut.repairedCode) {
          const updatedScene: SceneSpec = {
            ...currentScene,
            code: revOut.repairedCode,
            origem: 'gemini',
            status: 'ready',
          };
          const reCheck = inspectSceneFrames(updatedScene, i, workingReel);
          repaired = true;
          currentScene = {
            ...updatedScene,
            visualCheck: {
              passed: reCheck.passed,
              motionScore: reCheck.motionScore,
              coverageScore: reCheck.coverageScore,
              reviewNote: `${reviewNote} (${reCheck.motionScore}% mov)`,
              snapshots: reCheck.snapshots,
              repaired: true,
            },
          };
        } else {
          currentScene = {
            ...currentScene,
            visualCheck: {
              ...currentScene.visualCheck!,
              reviewNote,
              repaired,
            },
          };
        }

        if (needsRepair && i < total - 1 && pausaConfig > 0) {
          await new Promise((r) => setTimeout(r, pausaConfig * 1000));
        }
      } else {
        appendLog(
          `  👁️ ${fileName}: Movimento=${frameCheck.motionScore}% | Cobertura=${frameCheck.coverageScore}% (${
            frameCheck.passed ? 'OK' : 'Fallback'
          })`
        );
      }

      workingReel = {
        ...workingReel,
        scenes: workingReel.scenes.map((item, idx) => (idx === i ? currentScene : item)),
      };
      setData(workingReel);
    }

    appendLog(
      `=== REVISÃO FINALIZADA: Todas as ${total} cenas unificadas no Showreel Final ===`
    );
    setIsReviewing(false);
    setGenProgressLabel('');
    return workingReel;
  };

  // ====================== FLUXO MULTI-AGENTE COMPLETO (100% pelas Chaves Fixadas na Engrenagem ⚙️) ======================
  const runAgentWithKeys = async (overrideKey1?: string, overrideKey2?: string) => {
    if (isGenerating || isReviewing) return;

    // Desbloqueia imediatamente o AudioContext durante o clique/toque do usuário (essencial no Chrome Mobile)
    void audioRef.current?.resume();

    // Fixa e lê as chaves diretamente do padrão da Engrenagem (sem precisar de variável de ambiente)
    const fixed = fixarChavesPadraoEngrenagem(
      overrideKey1 !== undefined ? overrideKey1 : key1,
      overrideKey2 !== undefined ? overrideKey2 : key2
    );
    const activeK1 = fixed.key1;
    const activeK2 = fixed.key2;
    setKey1(activeK1);
    setKey2(activeK2);

    setIsGenerating(true);
    abortGenRef.current = false;
    const [W, H] = resConfig === '540x960' ? [540, 960] : [720, 1280];
    const userPrompt = promptText.trim() || 'showreel de motion design moderno';

    const shortPromptPreview =
      userPrompt.length > 100 ? `${userPrompt.slice(0, 100)}...` : userPrompt;
    setLogs([
      `Iniciando Pipeline Multi-Agente para: "${shortPromptPreview}"`,
      fixed.chaves.length > 0
        ? `✓ Usando ${fixed.chaves.length} chave(s) fixada(s) como padrão na Engrenagem ⚙️ (sem precisar de variáveis de ambiente).`
        : `⚠️ Nenhuma chave configurada na Engrenagem ⚙️ — abrindo painel para você colar as Chaves 1 e 2.`,
    ]);
    setGenProgressLabel('Roteirizando showreel...');

    if (fixed.chaves.length === 0) {
      setSettingsOpen(true);
    }

    try {
      // Etapa 1: Criar Roteiro 100% Direto usando as chaves fixadas na Engrenagem
      const planData = await gerarPlanoLocal({
        prompt: userPrompt,
        key1: activeK1,
        key2: activeK2,
        geminiModel: geminiModel.trim() || 'auto',
        duration: durationConfig,
        width: W,
        height: H,
        reaproveitar: reaproveitarConfig,
      });

      if (Array.isArray(planData.logs)) {
        appendLog(planData.logs);
      }

      let currentReel: ShowreelData = {
        ...planData.showreel,
        scenes: planData.showreel.scenes.map((s, idx) => ({
          ...s,
          agentId: ((idx % 2) + 1) as 1 | 2,
          fileName: `cena_${String(idx + 1).padStart(2, '0')}_${s.role}.js`,
        })),
      };

      const modelos: string[] = planData.modelos || [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-3-flash-preview',
      ];
      let currentMi: number = planData.mi || 0;
      const temChave: boolean = Boolean(planData.tem_chave);

      setData(currentReel);
      setDrawerOpen(true);
      setDrawerTab('files');
      gtRef.current = 0;
      t0Ref.current = performance.now();
      void play();

      // Etapa 2: Agente 1 (Cena 1, 3, 5...) e Agente 2 (Cena 2, 4, 6...) criam e salvam cada arquivo .js
      if (temChave) {
        let anterior = '';
        let novos = 0;
        const total = currentReel.scenes.length;

        for (let i = 0; i < total; i++) {
          if (abortGenRef.current) break;
          const s = currentReel.scenes[i];
          const agentNum = ((i % 2) + 1) as 1 | 2;
          const fileName = s.fileName || `cena_${String(i + 1).padStart(2, '0')}_${s.role}.js`;

          if (s.origem === 'biblioteca' && s.code) {
            anterior = s.idea || s.text;
            continue;
          }

          setGenProgressLabel(
            `Agente ${agentNum} (Chave ${agentNum}) → ${fileName} (${i + 1}/${total})...`
          );

          const prevScene = i > 0 ? currentReel.scenes[i - 1] : null;
          const nextScene = i < total - 1 ? currentReel.scenes[i + 1] : null;
          const ponteAnterior = prevScene?.visual_bridge || '';
          const proximaIdeia = nextScene ? `${nextScene.text} (${nextScene.idea})` : '';

          const sceneOut = await pedirCenaLocal({
            prompt: userPrompt,
            dna: currentReel.dna,
            scene: s,
            idx: i,
            total,
            anterior,
            ponteAnterior,
            proximaIdeia,
            width: W,
            height: H,
            key1: activeK1,
            key2: activeK2,
            modelos,
            mi: currentMi,
          });

          if (Array.isArray(sceneOut.logs)) {
            appendLog(sceneOut.logs);
          }
          if (typeof sceneOut.mi === 'number') {
            currentMi = sceneOut.mi;
          }

          const spokenText =
            s.narration || (s.sub ? `${s.text}. ${s.sub}` : s.text);

          const updatedScene: SceneSpec = {
            ...s,
            narration: spokenText,
            agentId: agentNum,
            fileName,
            code: sceneOut.code || null,
            origem: sceneOut.origem === 'gemini' ? 'gemini' : 'fallback',
            status: 'ready',
          };

          if (sceneOut.origem === 'gemini') novos += 1;

          currentReel = {
            ...currentReel,
            scenes: currentReel.scenes.map((scItem, idx) =>
              idx === i ? updatedScene : scItem
            ),
          };
          setData(currentReel);

          // Sintetiza a Voz Neural (Gemini TTS) em background sem travar a fila de criação das cenas!
          const sceneIdx = i;
          void (async () => {
            try {
              const ttsOut = await sintetizarVozCenaLocal({
                text: spokenText,
                idx: sceneIdx,
                voiceName,
                key1: activeK1,
                key2: activeK2,
              });
              if (ttsOut?.audioBase64) {
                setData((prev) => ({
                  ...prev,
                  scenes: prev.scenes.map((scItem, idx) =>
                    idx === sceneIdx
                      ? {
                          ...scItem,
                          voiceAudioBase64: ttsOut!.audioBase64 || undefined,
                          voiceMimeType: ttsOut!.mimeType || undefined,
                        }
                      : scItem
                  ),
                }));
              }
            } catch {
              // Web Speech API em português atua como fallback imediato
            }
          })();

          anterior = s.idea || s.text;

          if (i < total - 1 && pausaConfig > 0) {
            await new Promise((r) => setTimeout(r, pausaConfig * 1000));
          }
        }

        appendLog(
          `\nFase de Criação concluída: ${currentReel.scenes.length} arquivos gerados (${novos} novos do Gemini).`
        );

        // Etapa 3: Revisão Visual Automática (Os Agentes "veem" cada cena renderizada e consertam qualquer animação faltante)
        await runVisualInspectionPass(currentReel, modelos, currentMi);
      } else {
        await runVisualInspectionPass(currentReel, modelos, currentMi);
        appendLog(
          `\n⚠️ Cole suas 2 Chaves Gemini na ⚙️ Engrenagem: assim que você salvar as chaves lá, elas ficam fixadas como padrão e colocam a IA em funcionamento automaticamente!`
        );
      }
    } catch (err) {
      appendLog(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
      setIsReviewing(false);
      setGenProgressLabel('');
    }
  };

  const handleRunAgent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await runAgentWithKeys(key1, key2);
  };

  const saveSettings = (forceStartAi = false) => {
    const fixed = fixarChavesPadraoEngrenagem(key1, key2);
    setKey1(fixed.key1);
    setKey2(fixed.key2);
    try {
      localStorage.setItem('GEMINI_MODEL', geminiModel.trim() || 'auto');
      localStorage.setItem('VOICE_NAME', voiceName);
      localStorage.setItem('DURATION', String(durationConfig));
      localStorage.setItem('RES_CONFIG', resConfig);
      localStorage.setItem('REAPROVEITAR', String(reaproveitarConfig));
      localStorage.setItem('PAUSA_ENTRE_CHAMADAS', String(pausaConfig));
    } catch {
      // ignore storage restriction
    }
    setSettingsOpen(false);

    if (fixed.chaves.length > 0) {
      appendLog(
        `✓ Chaves da Engrenagem ⚙️ fixadas como padrão (${fixed.chaves.length} chave(s) pronta(s) — sem necessidade de variáveis de ambiente).`
      );
      const needsInitialAiRun = data.scenes.every((s) => s.origem !== 'gemini');
      if ((forceStartAi || needsInitialAiRun) && !isGenerating && !isReviewing) {
        void runAgentWithKeys(fixed.key1, fixed.key2);
      }
    }
  };

  const activeScene =
    compiledScenesRef.current[currentSceneIdx] || data.scenes[currentSceneIdx] || data.scenes[0];
  const configuredKeysCount = extrairChavesLocal(key1, key2).length;
  const activeAgentNum = ((currentSceneIdx % 2) + 1) as 1 | 2;

  return (
    <div className="h-[100dvh] w-full bg-[#07070b] text-[#eee] flex flex-col items-center p-2.5 sm:p-4 box-border gap-2 overflow-hidden select-none">
      {/* #top: Barra Superior Minimalista + Status do Agente da Cena + Botão Engrenagem ⚙️ */}
      <header className="w-full max-w-2xl flex items-center justify-between gap-2 text-xs sm:text-sm shrink-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <b className="text-sm sm:text-base font-bold text-white truncate">
            {data.title}
          </b>
          <span className="px-1.5 py-0.5 rounded bg-[#00f5a0]/15 border border-[#00f5a0]/40 text-[#00f5a0] font-mono text-[10px] font-semibold shrink-0">
            ⚙️ Padrão Fixo
          </span>
          <span className="opacity-75 font-mono text-[11px] sm:text-xs tabular-nums truncate">
            {recording ? '● GRAVANDO  ' : ''}
            {gtState.toFixed(1)}s / {data.duration}s · cena {currentSceneIdx + 1}/
            {data.scenes.length} · Agente {activeAgentNum} ({activeScene?.origem || 'fallback'})
          </span>
        </div>

        {/* Botão da Engrenagem (Chave 1 = Agente 1 | Chave 2 = Agente 2) */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Configurar e fixar Chave 1 (Agente 1) e Chave 2 (Agente 2) como padrão"
          className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform shrink-0 ${
            configuredKeysCount > 0
              ? 'bg-[#1b1b28] hover:bg-[#252538] border-[#00f5a0]/50'
              : 'bg-[#e11d48]/20 hover:bg-[#e11d48]/30 border-[#e11d48]'
          }`}
        >
          <Settings className="w-4 h-4 text-[#e11d48]" />
          <span>
            {configuredKeysCount === 2
              ? '2 Chaves Padrão Ativas'
              : configuredKeysCount === 1
              ? '1 Chave Padrão Ativa'
              : 'Configurar Chaves ⚙️'}
          </span>
        </button>
      </header>

      {/* Barra de Prompt Direta */}
      <form
        onSubmit={handleRunAgent}
        className="w-full max-w-2xl flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={promptText}
          onChange={(e) => {
            setPromptText(e.target.value);
            localStorage.setItem('LAST_PROMPT', e.target.value);
          }}
          placeholder="Descreva o showreel ou cole seu roteiro (Agente 1 e Agente 2 criarão cada cena)..."
          className="flex-1 h-11 px-3.5 rounded-xl bg-[#12121c] border border-[#2c2c40] focus:border-[#e11d48] focus:outline-none text-xs sm:text-sm text-white placeholder:text-white/40"
        />
        <button
          type="submit"
          disabled={isGenerating || isReviewing}
          className="h-11 px-4 rounded-xl bg-[#e11d48] hover:bg-[#be123c] disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap shrink-0"
        >
          {isGenerating || isReviewing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="max-w-[165px] sm:max-w-none truncate">
                {genProgressLabel || 'Processando...'}
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

      {/* #stage: Palco 9:16 Responsivo */}
      <div
        ref={stageRef}
        className="flex-1 min-h-[210px] sm:min-h-[300px] w-full max-w-2xl flex justify-center items-center relative"
      >
        <canvas
          ref={cvRef}
          width={data.W}
          height={data.H}
          onClick={() => (playing ? pause() : play())}
          className="bg-black rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.75)] border border-white/10 cursor-pointer"
        />
      </div>

      {/* #seek: Seletores de Arquivos por Cena (Agente 1 ⇄ Agente 2) + Scrubber */}
      <div className="w-full max-w-2xl space-y-1.5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {data.scenes.map((s, idx) => {
            const isCur = idx === currentSceneIdx;
            const ag = ((idx % 2) + 1) as 1 | 2;
            const vPass = s.visualCheck?.passed;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  const sc = compiledScenesRef.current[idx];
                  if (sc) {
                    gtRef.current = sc.start + 0.01;
                    lastSceneRef.current = -1;
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
                title={`Cena ${idx + 1} (${s.fileName || `cena_0${idx + 1}.js`}) · Agente ${ag}`}
                className={`h-6 px-2 rounded-md font-mono text-[11px] tabular-nums flex items-center gap-1 transition-colors shrink-0 border ${
                  isCur
                    ? 'bg-[#e11d48] text-white border-[#e11d48] font-semibold'
                    : s.status === 'compiling'
                    ? 'bg-[#1b1b28] text-[#f59e0b] border-[#f59e0b]/40'
                    : 'bg-[#12121c] text-white/70 border-[#252538] hover:text-white'
                }`}
              >
                <span>C{idx + 1}</span>
                <span className="opacity-65">A{ag}</span>
                {vPass && <span className="text-[#10b981]">✓</span>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setEditingSceneIdx(currentSceneIdx);
              setDraftSceneCode(data.scenes[currentSceneIdx]?.code || '');
            }}
            className="ml-auto h-6 px-2.5 rounded-md bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-[11px] text-white/85 flex items-center gap-1 shrink-0"
          >
            <Code2 className="w-3 h-3 text-[#f59e0b]" />
            <span>
              {data.scenes[currentSceneIdx]?.fileName || `cena_0${currentSceneIdx + 1}.js`}
            </span>
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

      {/* #bar: Controles do Showreel + Botão de Revisão Visual IA */}
      <div
        id="bar"
        className="w-full max-w-2xl flex flex-wrap justify-center gap-1.5 sm:gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={() => (playing ? pause() : play())}
          className="min-h-[42px] px-3.5 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-xs sm:text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{playing ? 'Pausar' : 'Play'}</span>
        </button>

        <button
          type="button"
          onClick={handleRestart}
          title="Reiniciar"
          className="min-h-[42px] px-3 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-xs sm:text-sm font-medium text-white flex items-center justify-center active:scale-95 transition-transform"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleSound}
          className="min-h-[42px] px-3 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-xs sm:text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
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
          onClick={handleToggleVoice}
          title="Ativar/Desativar Voz Narrando Tudo que Passa na Tela"
          className={`min-h-[42px] px-3 rounded-xl border text-xs sm:text-sm font-medium flex items-center gap-1.5 active:scale-95 transition-transform ${
            voiceEnabled && !muted
              ? 'bg-[#1b1b28] hover:bg-[#252538] border-[#e11d48]/70 text-white'
              : 'bg-[#12121c] border-[#33334a] text-white/55'
          }`}
        >
          {voiceEnabled && !muted ? (
            <Mic className="w-4 h-4 text-[#e11d48]" />
          ) : (
            <MicOff className="w-4 h-4 text-white/45" />
          )}
          <span>{voiceEnabled ? `Voz (${voiceName})` : 'Voz OFF'}</span>
        </button>

        <button
          type="button"
          onClick={() =>
            runVisualInspectionPass(
              data,
              discoveredModels.length
                ? discoveredModels
                : ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'],
              0
            )
          }
          disabled={isGenerating || isReviewing}
          title="Agentes assistem cada cena (15%, 50%, 85%) e consertam qualquer animação faltante"
          className="min-h-[42px] px-3 rounded-xl bg-[#1b1b28] hover:bg-[#252538] disabled:opacity-50 border border-[#33334a] text-xs sm:text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <ScanEye className="w-4 h-4 text-[#10b981]" />
          <span>Revisar Cenas</span>
        </button>

        <button
          type="button"
          onClick={recording ? stopRec : startRec}
          disabled={recording}
          className="min-h-[42px] px-3.5 rounded-xl bg-[#8a1030] hover:bg-[#a31439] disabled:opacity-60 border border-[#c0284d] text-xs sm:text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Video className="w-4 h-4" />
          <span>{recording ? 'Gravando...' : 'Gravar vídeo'}</span>
        </button>

        <button
          type="button"
          onClick={saveCode}
          title="Baixar todas_as_cenas.js unificado"
          className="min-h-[42px] px-3 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-xs sm:text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Download className="w-4 h-4" />
          <span>Salvar .JS</span>
        </button>

        <button
          type="button"
          onClick={saveHtml}
          title="Baixar showreel.html completo"
          className="min-h-[42px] px-3 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-xs sm:text-sm font-medium text-white flex items-center gap-1.5 active:scale-95 transition-transform"
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
            className="inline-flex items-center gap-2 bg-[#12805a] hover:bg-[#15966a] text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold no-underline shadow-lg"
          >
            <Download className="w-4 h-4" />
            <span>
              Baixar vídeo ({downloadVideo.ext}, {downloadVideo.sizeMb} MB)
            </span>
          </a>
        </div>
      )}

      {/* Gaveta Inferior: Arquivos por Cena + Visão do Agente (Quadros 15%, 50%, 85%) + Log */}
      <div className="w-full max-w-2xl bg-[#101018] border border-[#252538] rounded-xl overflow-hidden shrink-0">
        <div className="w-full px-3.5 py-2 flex items-center justify-between text-xs text-white/85">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setDrawerTab('files');
                setDrawerOpen(true);
              }}
              className={`flex items-center gap-1.5 font-medium ${
                drawerOpen && drawerTab === 'files'
                  ? 'text-[#e11d48]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Arquivos & Visão do Agente ({data.scenes.length} cenas)</span>
            </button>
            <span className="opacity-30">·</span>
            <button
              type="button"
              onClick={() => {
                setDrawerTab('log');
                setDrawerOpen(true);
              }}
              className={`flex items-center gap-1.5 font-medium ${
                drawerOpen && drawerTab === 'log'
                  ? 'text-[#e11d48]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Log ({logs.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="p-1 text-white/70 hover:text-white"
          >
            {drawerOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>

        {drawerOpen && (
          <div className="border-t border-[#1e1e2d] max-h-[20vh] sm:max-h-[26vh] overflow-y-auto p-3">
            {drawerTab === 'files' ? (
              <div className="space-y-2">
                {data.dna.narrative_thread && (
                  <div className="p-2.5 rounded-xl bg-[#141422] border border-[#2c2c44] text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#f59e0b]">
                        Direção Criativa: {data.dna.estilo}
                      </span>
                      <div className="flex items-center gap-1">
                        {[
                          data.dna.pal.bg1,
                          data.dna.pal.bg2,
                          data.dna.pal.acc,
                          data.dna.pal.acc2,
                          data.dna.pal.fg,
                        ].map((hex, hIdx) => (
                          <span
                            key={hIdx}
                            title={hex}
                            style={{ backgroundColor: hex }}
                            className="w-3 h-3 rounded-full border border-white/25 inline-block"
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-[11px] text-white/75 leading-relaxed">
                      <b className="text-white/90">Fio Condutor:</b> {data.dna.narrative_thread}
                    </p>
                  </div>
                )}

                {data.scenes.map((s, idx) => {
                  const ag = ((idx % 2) + 1) as 1 | 2;
                  const fName =
                    s.fileName || `cena_${String(idx + 1).padStart(2, '0')}_${s.role}.js`;
                  const vc = s.visualCheck;
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-[#0b0b12] border border-[#222234] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono tabular-nums">
                          <span className="font-bold text-white">{fName}</span>
                          <span className="opacity-40">·</span>
                          <span
                            className={
                              ag === 1 ? 'text-[#f43f5e]' : 'text-[#f59e0b]'
                            }
                          >
                            Agente {ag} (Chave {ag})
                          </span>
                          <span className="opacity-40">·</span>
                          <span className="text-white/60">{s.dur.toFixed(1)}s</span>
                          {s.layout_mode && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="text-[#10b981] text-[11px]">
                                {s.layout_mode}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-white truncate">
                          &ldquo;{s.text}&rdquo; —{' '}
                          <span className="font-normal text-white/65">{s.idea}</span>
                        </div>
                        <div className="text-[11px] text-[#10b981] truncate">
                          🎙️ <b className="text-white/85">Voz & Escrita na Tela:</b> &ldquo;
                          {s.narration || `${s.text}. ${s.sub || ''}`}&rdquo;
                          {s.voiceAudioBase64 ? ' (Voz Neural Gemini)' : ' (Voz Sincronizada)'}
                        </div>
                        {s.visual_bridge && (
                          <div className="text-[11px] text-white/55 truncate">
                            ↳ <b className="text-white/75">Conexão:</b> {s.visual_bridge}
                          </div>
                        )}
                        {vc && (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-white/75">
                            {vc.repaired ? (
                              <Wrench className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
                            )}
                            <span className="truncate">
                              Mov: {vc.motionScore}% · Cob: {vc.coverageScore}% ·{' '}
                              {vc.reviewNote}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quadros que o Agente "Viu" (15%, 50%, 85%) + Botões do Arquivo Individual */}
                      <div className="flex items-center gap-2 shrink-0">
                        {vc?.snapshots && vc.snapshots.length > 0 && (
                          <div
                            className="flex items-center gap-1"
                            title="Quadros inspecionados pelo Agente (15%, 50%, 85%)"
                          >
                            {vc.snapshots.map((snap, sIdx) => (
                              <img
                                key={sIdx}
                                src={snap}
                                alt={`Cena ${idx + 1} frame ${sIdx + 1}`}
                                className="w-7 h-12 object-cover rounded border border-white/15 bg-black"
                              />
                            ))}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setEditingSceneIdx(idx);
                            setDraftSceneCode(s.code || '');
                          }}
                          className="h-8 px-2.5 rounded-lg bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-[11px] text-white flex items-center gap-1"
                        >
                          <Code2 className="w-3 h-3 text-[#f59e0b]" />
                          <span>Código</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => downloadSingleSceneFile(s, idx)}
                          title={`Baixar ${fName}`}
                          className="h-8 px-2.5 rounded-lg bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-[11px] text-white flex items-center gap-1"
                        >
                          <Download className="w-3 h-3 text-[#10b981]" />
                          <span>.JS</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <pre
                id="log"
                className="text-[11px] font-mono text-white/75 whitespace-pre-wrap"
              >
                {logs.join('\n')}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* ====================== MODAL DA ENGRENAGEM ⚙️ (AGENTE 1 = CHAVE 1 | AGENTE 2 = CHAVE 2) ====================== */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#12121c] border-t sm:border border-[#2e2e44] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#252538]">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#e11d48]" />
                <h2 className="text-base font-bold text-white">
                  Configuração dos 2 Agentes Gemini
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

            {/* Aviso de Padrão Fixo na Engrenagem (Sem precisar de Variável de Ambiente) */}
            <div className="p-3 rounded-xl bg-[#00f5a0]/10 border border-[#00f5a0]/30 text-[11px] text-white/90 leading-relaxed">
              <b className="text-[#00f5a0]">Padrão Fixo na Engrenagem ⚙️:</b> Assim que você colar as 2 chaves abaixo, elas ficam salvas e fixadas como padrão neste aplicativo e colocam a IA em funcionamento imediatamente — <b>sem precisar configurar variáveis de ambiente na Vercel</b>.
            </div>

            {/* Chave 1 -> Agente 1 */}
            <div>
              <label className="block text-xs font-semibold text-white/90 mb-1">
                GEMINI_API_KEY_1 — Agente 1 (Cenas Ímpares: Cena 1, 3, 5, 7...)
              </label>
              <div className="relative flex items-center">
                <input
                  type={showKey1 ? 'text' : 'password'}
                  value={key1}
                  onChange={(e) => handleKey1Input(e.target.value)}
                  placeholder="Cole aqui a Chave 1 da Gemini (AIza...)"
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

            {/* Chave 2 -> Agente 2 */}
            <div>
              <label className="block text-xs font-semibold text-white/90 mb-1">
                GEMINI_API_KEY_2 — Agente 2 (Cenas Pares: Cena 2, 4, 6, 8...)
              </label>
              <div className="relative flex items-center">
                <input
                  type={showKey2 ? 'text' : 'password'}
                  value={key2}
                  onChange={(e) => handleKey2Input(e.target.value)}
                  placeholder="Cole aqui a Chave 2 da Gemini (AIza...)"
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
                O Agente 1 (Chave 1) cria e salva as cenas 1, 3, 5... e o Agente 2 (Chave 2) cria e salva as cenas 2, 4, 6..., dividindo a carga ao meio.
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
                  REAPROVEITAR (0 = criar 100% inédito)
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

              <div className="col-span-2">
                <label className="block text-xs text-white/80 mb-1">
                  VOZ DO NARRADOR (Gemini Neural TTS + Sincronia na Tela)
                </label>
                <select
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[#07070b] border border-[#2c2c42] font-mono text-xs text-white"
                >
                  <option value="Aoede">Aoede (Feminina Natural & Expressiva)</option>
                  <option value="Kore">Kore (Feminina Firme & Comercial)</option>
                  <option value="Puck">Puck (Masculina Dinâmica & Jovem)</option>
                  <option value="Charon">Charon (Masculina Grave & Cinematográfica)</option>
                  <option value="Fenrir">Fenrir (Masculina Forte & Impactante)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => saveSettings(false)}
                className="w-full sm:w-auto px-4 h-11 rounded-xl bg-[#1b1b28] hover:bg-[#252538] border border-[#33334a] text-xs sm:text-sm font-medium text-white flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4 text-[#00f5a0]" />
                <span>Fixar como Padrão</span>
              </button>
              <button
                type="button"
                onClick={() => saveSettings(true)}
                className="w-full sm:flex-1 h-11 rounded-xl bg-[#e11d48] hover:bg-[#be123c] text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Fixar Padrão & Colocar IA em Funcionamento</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================== MODAL DE EDIÇÃO DO ARQUIVO DA CENA ====================== */}
      {editingSceneIdx !== null && data.scenes[editingSceneIdx] && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#12121c] border-t sm:border border-[#2e2e44] rounded-t-3xl sm:rounded-2xl p-5 space-y-3 max-h-[88dvh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[#252538]">
              <div>
                <span className="text-xs font-mono text-white/60">
                  {data.scenes[editingSceneIdx].fileName ||
                    `cena_0${editingSceneIdx + 1}.js`}{' '}
                  · Agente {((editingSceneIdx % 2) + 1) as 1 | 2} ·{' '}
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
              placeholder="// Corpo da função (ctx, t, ts, W, H, P, M)"
              className="w-full flex-1 min-h-[220px] p-3 rounded-xl bg-[#07070b] border border-[#2c2c42] font-mono text-xs text-white/90 resize-none focus:border-[#e11d48] focus:outline-none"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const idx = editingSceneIdx;
                  setData((prev) => {
                    const updatedScenes = prev.scenes.map((s, i) => {
                      if (i !== idx) return s;
                      const nextScene: SceneSpec = {
                        ...s,
                        code: draftSceneCode.trim() || null,
                        origem: draftSceneCode.trim() ? 'gemini' : 'fallback',
                      };
                      const check = inspectSceneFrames(nextScene, idx, prev);
                      nextScene.visualCheck = {
                        passed: check.passed,
                        motionScore: check.motionScore,
                        coverageScore: check.coverageScore,
                        reviewNote: check.diagnosticReason,
                        snapshots: check.snapshots,
                      };
                      return nextScene;
                    });
                    return { ...prev, scenes: updatedScenes };
                  });
                  setEditingSceneIdx(null);
                }}
                className="flex-1 h-11 rounded-xl bg-[#e11d48] hover:bg-[#be123c] text-xs font-semibold text-white"
              >
                Salvar e Inspecionar {data.scenes[editingSceneIdx].fileName}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadSingleSceneFile(
                    data.scenes[editingSceneIdx],
                    editingSceneIdx
                  )
                }
                className="h-11 px-4 rounded-xl bg-[#1b1b28] border border-[#33334a] text-xs text-white/85 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-[#10b981]" />
                <span>Baixar .JS</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
