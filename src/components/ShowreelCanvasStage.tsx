import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Video,
  Download,
  Code2,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { SceneSpec, ShowreelData } from '../types/showreel';
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
} from '../engine/motionEngine';
import { ShowreelAudioSynth } from '../engine/audioSynth';

interface CompiledScene extends SceneSpec {
  fn: SceneDrawFn;
  start: number;
  avgMs?: number;
}

interface ShowreelCanvasStageProps {
  data: ShowreelData;
  activeSceneIndex: number;
  onSelectScene: (index: number) => void;
  onOpenCodeEditor: (index: number) => void;
  isGenerating: boolean;
}

const TR = 0.32;

export const ShowreelCanvasStage: React.FC<ShowreelCanvasStageProps> = ({
  data,
  activeSceneIndex,
  onSelectScene,
  onOpenCodeEditor,
  isGenerating,
}) => {
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offOldRef = useRef<HTMLCanvasElement | null>(null);
  const offNewRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<ShowreelAudioSynth | null>(null);

  const [playing, setPlaying] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [currentSceneIdx, setCurrentSceneIdx] = useState<number>(0);
  const [recording, setRecording] = useState<boolean>(false);
  const [recordedVideo, setRecordedVideo] = useState<{
    url: string;
    name: string;
    ext: string;
    sizeMb: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const playingRef = useRef<boolean>(true);
  const gtRef = useRef<number>(0);
  const t0Ref = useRef<number>(performance.now());
  const lastHalfRef = useRef<number>(-1);
  const lastSceneRef = useRef<number>(-1);
  const compiledScenesRef = useRef<CompiledScene[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingRef = useRef<boolean>(false);

  // Initialize audio synth once
  useEffect(() => {
    audioRef.current = new ShowreelAudioSynth();
  }, []);

  // Compile and pre-validate scenes whenever `data` changes
  useEffect(() => {
    const W = data.W;
    const H = data.H;

    if (!offOldRef.current) {
      offOldRef.current = document.createElement('canvas');
    }
    if (!offNewRef.current) {
      offNewRef.current = document.createElement('canvas');
    }
    offOldRef.current.width = W;
    offOldRef.current.height = H;
    offNewRef.current.width = W;
    offNewRef.current.height = H;

    const cxn = offNewRef.current.getContext('2d');

    let acc = 0;
    const compiled: CompiledScene[] = data.scenes.map((s, i) => {
      let fn: SceneDrawFn | null = null;
      let origem = s.origem;
      if (s.code) {
        try {
          fn = compileSceneCode(s.code);
        } catch {
          fn = null;
          origem = 'fallback';
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

    // Pre-flight performance & crash check at [0.05, 0.5, 0.95]
    if (cxn) {
      compiled.forEach((s, i) => {
        try {
          const tStart = performance.now();
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
          const avgMs = (performance.now() - tStart) / 3;
          s.avgMs = Math.round(avgMs * 10) / 10;
          if (avgMs > 120) {
            s.fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
            s.origem = 'fallback';
          }
        } catch {
          s.fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
          s.origem = 'fallback';
        }
      });
    }

    compiledScenesRef.current = compiled;
  }, [data]);

  const paintScene = useCallback(
    (c: CanvasRenderingContext2D, idx: number, ts: number, gt: number) => {
      const scenes = compiledScenesRef.current;
      if (!scenes.length) return;
      const s = scenes[Math.max(0, Math.min(scenes.length - 1, idx))];
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
        i: idx,
      };
      MotionLib.bg(c, W, H, P, idx);
      try {
        s.fn(c, MotionLib.clamp(ts / s.dur), ts, W, H, P, MotionLib);
      } catch {
        s.fn = FallbackEngines[s.fb] || FallbackEngines.kinetic;
        s.origem = 'fallback';
        resetCanvasCtx(c);
        MotionLib.bg(c, W, H, P, idx);
        s.fn(c, MotionLib.clamp(ts / s.dur), ts, W, H, P, MotionLib);
      }
      try {
        MotionLib.sub(c, W, H, P, ts);
      } catch {
        // ignore subtitle error
      }
    },
    [data]
  );

  const renderFrameAt = useCallback(
    (gtInput: number): number => {
      const cv = mainCanvasRef.current;
      const co = offOldRef.current;
      const cn = offNewRef.current;
      const scenes = compiledScenesRef.current;
      if (!cv || !co || !cn || !scenes.length) return 0;

      const ctx = cv.getContext('2d');
      const cxo = co.getContext('2d');
      const cxn = cn.getContext('2d');
      if (!ctx || !cxo || !cxn) return 0;

      const DUR = data.duration;
      const W = data.W;
      const H = data.H;
      const gt = MotionLib.clamp(gtInput, 0, DUR - 1e-3);

      let i = 0;
      while (i < scenes.length - 1 && gt >= scenes[i + 1].start) {
        i++;
      }
      const ts = gt - scenes[i].start;

      if (i > 0 && ts < TR) {
        paintScene(cxn, i, ts, gt);
        paintScene(cxo, i - 1, scenes[i - 1].dur + ts, gt);
        compositeTransition(ctx, co, cn, data.dna.transition, ts / TR, W, H, data.dna.pal);
      } else {
        paintScene(ctx, i, ts, gt);
      }

      const fade =
        gt < 0.4 ? 1 - gt / 0.4 : gt > DUR - 0.5 ? 1 - (DUR - gt) / 0.5 : 0;
      if (fade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${MotionLib.clamp(fade)})`;
        ctx.fillRect(0, 0, W, H);
      }
      return i;
    },
    [data, paintScene]
  );

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Main 60fps animation loop
  useEffect(() => {
    let rafId = 0;
    let lastUiUpdate = 0;

    const tick = (now: number) => {
      const DUR = data.duration;
      if (playingRef.current) {
        gtRef.current = (now - t0Ref.current) / 1000;
        if (gtRef.current >= DUR) {
          if (recordingRef.current) {
            gtRef.current = DUR - 1e-3;
            playingRef.current = false;
            setPlaying(false);
            setTimeout(stopRecording, 400);
          } else {
            // Loop seamlessly in studio preview mode
            gtRef.current = 0;
            t0Ref.current = now;
            lastHalfRef.current = -1;
          }
        }
      }

      const i = renderFrameAt(gtRef.current);

      if (playingRef.current && audioRef.current && !audioRef.current.isMuted()) {
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

      if (now - lastUiUpdate > 65) {
        lastUiUpdate = now;
        setCurrentTime(gtRef.current);
        setCurrentSceneIdx(i);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [data, renderFrameAt, stopRecording]);

  const togglePlay = async () => {
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
    } else {
      await audioRef.current?.resume();
      if (gtRef.current >= data.duration - 0.05) {
        gtRef.current = 0;
      }
      t0Ref.current = performance.now() - gtRef.current * 1000;
      lastHalfRef.current = -1;
      playingRef.current = true;
      setPlaying(true);
    }
  };

  const restartReel = () => {
    gtRef.current = 0;
    t0Ref.current = performance.now();
    lastHalfRef.current = -1;
    setCurrentTime(0);
    setCurrentSceneIdx(0);
  };

  const toggleSound = async () => {
    await audioRef.current?.resume();
    const nextMuted = !muted;
    audioRef.current?.setMuted(nextMuted);
    setMuted(nextMuted);
  };

  const handleSeek = (val: number) => {
    const targetTime = (val / 1000) * data.duration;
    gtRef.current = targetTime;
    t0Ref.current = performance.now() - targetTime * 1000;
    setCurrentTime(targetTime);
    const idx = renderFrameAt(targetTime);
    setCurrentSceneIdx(idx);
  };

  const jumpToScene = (idx: number) => {
    const scenes = compiledScenesRef.current;
    if (!scenes[idx]) return;
    const targetTime = scenes[idx].start + 0.01;
    gtRef.current = targetTime;
    t0Ref.current = performance.now() - targetTime * 1000;
    setCurrentTime(targetTime);
    setCurrentSceneIdx(idx);
    onSelectScene(idx);
  };

  const startRecording = async () => {
    if (recordingRef.current || !mainCanvasRef.current) return;
    await audioRef.current?.resume();

    const types = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType =
      (typeof MediaRecorder !== 'undefined' &&
        types.find((t) => MediaRecorder.isTypeSupported(t))) ||
      '';

    if (!mimeType) {
      setStatusMessage('Navegador sem suporte a MediaRecorder. Exporte o HTML standalone.');
      return;
    }

    const stream = mainCanvasRef.current.captureStream(30);
    const audioTracks = audioRef.current?.getAudioTracks() || [];
    audioTracks.forEach((t) => stream.addTrack(t));

    const chunks: BlobPart[] = [];
    const mr = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8000000,
    });

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mr.onstop = () => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      const url = URL.createObjectURL(blob);
      const name = `showreel_${Date.now()}.${ext}`;
      const sizeMb = (blob.size / 1e6).toFixed(1);
      setRecordedVideo({ url, name, ext: ext.toUpperCase(), sizeMb });
      recordingRef.current = false;
      setRecording(false);

      // Trigger automatic download
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    mediaRecorderRef.current = mr;
    setRecordedVideo(null);
    setStatusMessage(null);
    recordingRef.current = true;
    setRecording(true);
    gtRef.current = 0;
    t0Ref.current = performance.now();
    lastHalfRef.current = -1;
    playingRef.current = true;
    setPlaying(true);
    mr.start(500);
  };

  const handleExportJs = () => {
    const js = buildJsBundle(data);
    const blob = new Blob([js], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `showreel_codigo_${Date.now()}.js`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleExportHtml = () => {
    const html = buildStandaloneHtml(data);
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `showreel_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const activeScene = data.scenes[currentSceneIdx] || data.scenes[0];

  return (
    <div className="flex flex-col items-center w-full">
      {/* Top Stage Metadata Strip - Unboxed Zero-Pill Typography */}
      <div className="w-full flex items-center justify-between gap-2 pb-2.5 text-xs text-[#9496a8]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-semibold text-[#f4f4f6] truncate">{data.title}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums shrink-0">
            {data.W}×{data.H}
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
          {recording ? (
            <span className="text-[#e11d48] font-semibold">GRAVANDO</span>
          ) : isGenerating ? (
            <span className="text-[#f59e0b] font-medium">COMPILANDO</span>
          ) : null}
          {(recording || isGenerating) && <span aria-hidden="true">·</span>}
          <span className="text-[#f4f4f6]">{currentTime.toFixed(1)}s</span>
          <span>/</span>
          <span>{data.duration.toFixed(0)}s</span>
          <span aria-hidden="true">·</span>
          <span>
            Cena {currentSceneIdx + 1}/{data.scenes.length}
          </span>
        </div>
      </div>

      {/* 9:16 Vertical Canvas Viewport */}
      <div className="relative w-full max-w-[330px] sm:max-w-[360px] aspect-[9/16] rounded-2xl overflow-hidden bg-black border border-[#262636] shadow-2xl flex items-center justify-center group">
        <canvas
          ref={mainCanvasRef}
          width={data.W}
          height={data.H}
          onClick={togglePlay}
          className="w-full h-full object-contain cursor-pointer"
        />

        {/* Subtle Top Scrim with Scene Info & Quick Code Trigger */}
        <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/75 via-black/30 to-transparent flex items-center justify-between pointer-events-none">
          <div className="text-[11px] text-white/85 font-mono tabular-nums truncate pr-2">
            <span>0{currentSceneIdx + 1}</span>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="uppercase">{activeScene?.role}</span>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="opacity-75">{activeScene?.origem}</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenCodeEditor(currentSceneIdx);
            }}
            className="pointer-events-auto min-h-[36px] px-2.5 rounded-lg bg-black/60 hover:bg-black/80 border border-white/15 text-[11px] font-medium text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Code2 className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span>Editar Cena</span>
          </button>
        </div>

        {/* Recording Progress Bar Overlay */}
        {recording && (
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/60">
            <div
              className="h-full bg-[#e11d48] transition-transform duration-75 origin-left"
              style={{
                transform: `scaleX(${Math.min(1, currentTime / data.duration)})`,
              }}
            />
          </div>
        )}
      </div>

      {/* Interactive Scene Segment Strip & Timeline Scrubber */}
      <div className="w-full max-w-[360px] mt-3 space-y-2">
        {/* Segmented Scene Jump Bar */}
        <div className="grid grid-flow-col auto-cols-fr gap-1">
          {data.scenes.map((s, idx) => {
            const isCurrent = idx === currentSceneIdx;
            const isSelected = idx === activeSceneIndex;
            const isCompiling = s.status === 'compiling';
            return (
              <button
                key={idx}
                type="button"
                onClick={() => jumpToScene(idx)}
                title={`Cena ${idx + 1}: ${s.text} (${s.origem})`}
                className={`h-7 rounded-md flex items-center justify-center font-mono text-[11px] tabular-nums transition-colors border ${
                  isCurrent
                    ? 'bg-[#e11d48] text-white border-[#e11d48] font-semibold'
                    : isSelected
                    ? 'bg-[#1e1e2d] text-[#f4f4f6] border-[#454560]'
                    : isCompiling
                    ? 'bg-[#181824] text-[#f59e0b] border-[#f59e0b]/40'
                    : 'bg-[#12121a] text-[#9496a8] border-[#222230] hover:text-white'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Continuous Scrubber */}
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round((currentTime / data.duration) * 1000)}
          onChange={(e) => handleSeek(Number(e.target.value))}
          aria-label="Linha do tempo do showreel"
          className="w-full studio-slider"
        />
      </div>

      {/* Primary Tactile Transport Controls (44x44px min touch targets) */}
      <div className="w-full max-w-[360px] mt-2 grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="min-h-[44px] px-3 rounded-xl bg-[#151520] hover:bg-[#1e1e2d] border border-[#262636] text-xs font-medium text-[#f4f4f6] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform whitespace-nowrap shrink-0"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{playing ? 'Pausar' : 'Play'}</span>
        </button>

        <button
          type="button"
          onClick={restartReel}
          title="Reiniciar do zero"
          className="min-h-[44px] px-3 rounded-xl bg-[#151520] hover:bg-[#1e1e2d] border border-[#262636] text-xs font-medium text-[#f4f4f6] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Início</span>
        </button>

        <button
          type="button"
          onClick={toggleSound}
          className="min-h-[44px] px-3 rounded-xl bg-[#151520] hover:bg-[#1e1e2d] border border-[#262636] text-xs font-medium text-[#f4f4f6] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform whitespace-nowrap shrink-0"
        >
          {muted ? (
            <VolumeX className="w-4 h-4 text-[#9496a8]" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#f59e0b]" />
          )}
          <span>{muted ? 'Mudo' : 'Batida'}</span>
        </button>

        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform whitespace-nowrap shrink-0 ${
            recording
              ? 'bg-[#b91c1c] border border-[#ef4444]'
              : 'bg-[#e11d48] hover:bg-[#be123c]'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>{recording ? 'Parar' : 'Gravar'}</span>
        </button>
      </div>

      {/* Quick Export Row (.HTML Standalone & .JS Code Bundle) */}
      <div className="w-full max-w-[360px] mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleExportHtml}
          className="min-h-[42px] px-3 rounded-xl bg-[#111118] hover:bg-[#181822] border border-[#222230] text-xs font-medium text-[#c4c6d4] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <FileCode className="w-3.5 h-3.5 text-[#9496a8]" />
          <span>Baixar Player HTML</span>
        </button>
        <button
          type="button"
          onClick={handleExportJs}
          className="min-h-[42px] px-3 rounded-xl bg-[#111118] hover:bg-[#181822] border border-[#222230] text-xs font-medium text-[#c4c6d4] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[#9496a8]" />
          <span>Salvar Código .JS</span>
        </button>
      </div>

      {/* Recorded Video Download Banner */}
      {recordedVideo && (
        <div className="w-full max-w-[360px] mt-3 p-3 rounded-xl bg-[#111f1a] border border-[#1f4d3b] flex items-center justify-between gap-3">
          <div className="text-xs text-[#d1fae5] truncate">
            <span className="font-semibold">Vídeo finalizado</span>
            <span className="mx-1.5 opacity-60">·</span>
            <span className="font-mono tabular-nums">
              {recordedVideo.ext} · {recordedVideo.sizeMb} MB
            </span>
          </div>
          <a
            href={recordedVideo.url}
            download={recordedVideo.name}
            className="min-h-[36px] px-3 rounded-lg bg-[#10b981] hover:bg-[#059669] text-xs font-semibold text-[#052e16] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar</span>
          </a>
        </div>
      )}

      {statusMessage && (
        <p className="w-full max-w-[360px] mt-2 text-xs text-[#f59e0b] text-center">
          {statusMessage}
        </p>
      )}
    </div>
  );
};
