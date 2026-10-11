import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Check,
  AlertTriangle,
  RefreshCw,
  Code2,
  Sliders,
  Shuffle,
} from 'lucide-react';
import {
  FALLBACKS,
  FallbackKind,
  SceneSpec,
  ShowreelData,
} from '../types/showreel';
import { validateSceneCode } from '../engine/motionEngine';

interface SceneInspectorPanelProps {
  data: ShowreelData;
  sceneIndex: number;
  onUpdateScene: (index: number, patch: Partial<SceneSpec>) => void;
  onRegenerateScene: (index: number) => void;
}

export const SceneInspectorPanel: React.FC<SceneInspectorPanelProps> = ({
  data,
  sceneIndex,
  onUpdateScene,
  onRegenerateScene,
}) => {
  const scene = data.scenes[sceneIndex] || data.scenes[0];
  const [draftCode, setDraftCode] = useState<string>(scene?.code || '');
  const [validationStatus, setValidationStatus] = useState<{
    valid: boolean;
    error?: string;
    avgMs?: number;
  } | null>(null);
  const [tab, setTab] = useState<'props' | 'code'>('props');

  useEffect(() => {
    setDraftCode(scene?.code || '');
    setValidationStatus(null);
  }, [sceneIndex, scene?.code]);

  if (!scene) return null;

  const handleApplyCode = () => {
    if (!draftCode.trim()) {
      onUpdateScene(sceneIndex, { code: null, origem: 'fallback' });
      setValidationStatus({ valid: true, avgMs: 2 });
      return;
    }
    const result = validateSceneCode(draftCode, scene, data);
    setValidationStatus(result);
    if (result.valid) {
      onUpdateScene(sceneIndex, {
        code: draftCode,
        origem: 'custom',
        compileMs: result.avgMs,
      });
    }
  };

  const handleRandomizeSeed = () => {
    onUpdateScene(sceneIndex, {
      seed: Math.floor(1 + Math.random() * 999999),
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#111118] border border-[#222230] rounded-2xl p-4 sm:p-5">
      {/* Header with Unboxed Metadata */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#222230]">
        <div>
          <div className="text-xs text-[#9496a8] font-mono tabular-nums">
            <span>0{sceneIndex + 1}.</span>
            <span className="mx-1.5">·</span>
            <span className="uppercase text-[#f4f4f6] font-semibold">{scene.role}</span>
            <span className="mx-1.5">·</span>
            <span>{scene.dur.toFixed(1)}s</span>
            <span className="mx-1.5">·</span>
            <span>{scene.origem}</span>
          </div>
          <h3 className="text-base font-semibold text-[#f4f4f6] mt-0.5 truncate">
            {scene.text || 'Cena sem título'}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => onRegenerateScene(sceneIndex)}
          disabled={scene.status === 'compiling'}
          className="min-h-[40px] px-3 rounded-xl bg-[#1b1b28] hover:bg-[#252538] disabled:opacity-50 border border-[#323248] text-xs font-medium text-[#f4f4f6] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-[#e11d48] ${
              scene.status === 'compiling' ? 'animate-spin' : ''
            }`}
          />
          <span>{scene.status === 'compiling' ? 'Compilando' : 'Recriar IA'}</span>
        </button>
      </div>

      {/* Segmented Control: Propriedades vs Código Canvas 2D */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-[#0b0b10] rounded-xl mt-3 border border-[#1e1e2a]">
        <button
          type="button"
          onClick={() => setTab('props')}
          className={`min-h-[38px] px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            tab === 'props'
              ? 'bg-[#1e1e2d] text-white shadow-sm'
              : 'text-[#9496a8] hover:text-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Direção da Cena</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('code')}
          className={`min-h-[38px] px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            tab === 'code'
              ? 'bg-[#1e1e2d] text-white shadow-sm'
              : 'text-[#9496a8] hover:text-white'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Código Canvas 2D</span>
        </button>
      </div>

      {tab === 'props' ? (
        <div className="mt-4 space-y-3.5 flex-1">
          <div>
            <label className="block text-xs font-medium text-[#c4c6d4] mb-1.5">
              Texto Principal (P.text)
            </label>
            <input
              type="text"
              maxLength={40}
              value={scene.text}
              onChange={(e) => onUpdateScene(sceneIndex, { text: e.target.value })}
              placeholder="Ex: PRECISÃO EM MOVIMENTO"
              className="w-full h-11 px-3.5 rounded-xl bg-[#0b0b10] border border-[#262636] focus:border-[#e11d48] focus:outline-none text-sm text-[#f4f4f6] font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#c4c6d4] mb-1.5">
              Subtítulo Opcional (P.sub)
            </label>
            <input
              type="text"
              maxLength={60}
              value={scene.sub}
              onChange={(e) => onUpdateScene(sceneIndex, { sub: e.target.value })}
              placeholder="Ex: direção de arte procedural"
              className="w-full h-11 px-3.5 rounded-xl bg-[#0b0b10] border border-[#262636] focus:border-[#e11d48] focus:outline-none text-sm text-[#f4f4f6]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#c4c6d4] mb-1.5">
              Ideia Visual para o Gemini
            </label>
            <textarea
              rows={3}
              value={scene.idea}
              onChange={(e) => onUpdateScene(sceneIndex, { idea: e.target.value })}
              placeholder="Descreva formas, câmera, movimento e camadas para esta cena..."
              className="w-full p-3 rounded-xl bg-[#0b0b10] border border-[#262636] focus:border-[#e11d48] focus:outline-none text-xs text-[#f4f4f6] leading-relaxed resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-[#c4c6d4] mb-1.5">
                Motor Procedural Base
              </label>
              <select
                value={scene.fb}
                onChange={(e) =>
                  onUpdateScene(sceneIndex, {
                    fb: e.target.value as FallbackKind,
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-[#0b0b10] border border-[#262636] focus:border-[#e11d48] focus:outline-none text-xs text-[#f4f4f6]"
              >
                {[...FALLBACKS, 'closing'].map((fb) => (
                  <option key={fb} value={fb}>
                    {fb.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#c4c6d4] mb-1.5">
                Seed Determinística
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={scene.seed}
                  onChange={(e) =>
                    onUpdateScene(sceneIndex, {
                      seed: Number(e.target.value) || 1,
                    })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-[#0b0b10] border border-[#262636] text-xs font-mono tabular-nums text-[#f4f4f6]"
                />
                <button
                  type="button"
                  onClick={handleRandomizeSeed}
                  title="Sortear nova seed"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-[#181824] hover:bg-[#222232] border border-[#262636] flex items-center justify-center text-[#c4c6d4]"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col flex-1 min-h-[280px]">
          <div className="flex items-center justify-between text-[11px] text-[#9496a8] font-mono mb-1.5">
            <span> Assinatura: (ctx, t, ts, W, H, P, M) </span>
            {scene.compileMs !== undefined && (
              <span className="tabular-nums">{scene.compileMs} ms/frame</span>
            )}
          </div>

          <textarea
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            spellCheck={false}
            placeholder={`// Corpo da função Canvas 2D (ou deixe vazio para usar o motor procedural '${scene.fb}')\nconst R = M.rng(P.seed);\nM.deco(ctx, W, H, P, ts);\nM.mainText(ctx, W, H, P, ts, { scale: 1 });`}
            className="w-full flex-1 min-h-[210px] p-3 rounded-xl bg-[#07070b] border border-[#262636] focus:border-[#e11d48] focus:outline-none font-mono text-xs text-[#e2e8f0] leading-relaxed resize-none"
          />

          {validationStatus && (
            <div
              className={`mt-2.5 p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                validationStatus.valid
                  ? 'bg-[#0f2922] text-[#a7f3d0] border border-[#10b981]/30'
                  : 'bg-[#2c1219] text-[#fecdd3] border border-[#e11d48]/40'
              }`}
            >
              {validationStatus.valid ? (
                <>
                  <Check className="w-4 h-4 shrink-0 text-[#10b981]" />
                  <span>
                    Cena compilada com sucesso ({validationStatus.avgMs} ms/frame).
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#e11d48]" />
                  <span className="truncate">{validationStatus.error}</span>
                </>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyCode}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#e11d48] hover:bg-[#be123c] text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Aplicar Código em Tempo Real</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftCode('');
                onUpdateScene(sceneIndex, { code: null, origem: 'fallback' });
                setValidationStatus(null);
              }}
              className="min-h-[44px] px-3 rounded-xl bg-[#181824] hover:bg-[#232334] border border-[#262636] text-xs font-medium text-[#9496a8] hover:text-white whitespace-nowrap shrink-0"
            >
              Usar Fallback
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
