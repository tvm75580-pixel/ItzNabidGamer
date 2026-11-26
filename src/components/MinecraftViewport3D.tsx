import React, { useEffect, useRef, useState } from 'react';
import { Layers, RotateCcw, ZoomIn, ZoomOut, Play, Pause } from 'lucide-react';
import {
  loadNormalizedSkinCanvas,
  MinecraftWebGLRenderer,
  renderMinecraftSoftware2D,
} from '../engine/minecraft3d';
import { CharacterPose, SkinModel } from '../types';

interface MinecraftViewport3DProps {
  skinDataUrl: string;
  model: SkinModel;
  lowPowerMode?: boolean;
  forceSoftware3D?: boolean;
  initialPose?: CharacterPose;
  compact?: boolean;
  className?: string;
}

const POSES: { id: CharacterPose; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'combat', label: 'Combat' },
  { id: 'walk', label: 'Walk' },
  { id: 'showcase', label: 'Stance' },
];

export const MinecraftViewport3D: React.FC<MinecraftViewport3DProps> = ({
  skinDataUrl,
  model,
  lowPowerMode = false,
  forceSoftware3D = false,
  initialPose = 'idle',
  compact = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pose, setPose] = useState<CharacterPose>(initialPose);
  const [showOuter, setShowOuter] = useState(true);
  const [autoSpin, setAutoSpin] = useState(true);
  const [zoom, setZoom] = useState(1.02);
  const [activeEngine, setActiveEngine] = useState<'webgl' | 'canvas2d'>(
    forceSoftware3D ? 'canvas2d' : 'webgl'
  );

  // Mutable animation state kept in refs to avoid React re-render overhead on 60fps frames
  const stateRef = useRef({
    yaw: 0.42,
    pitch: 0.1,
    zoom: 1.02,
    pose: initialPose,
    model,
    showOuter: true,
    autoSpin: true,
    dragging: false,
    lastX: 0,
    lastY: 0,
    timeSec: 0,
  });

  useEffect(() => {
    stateRef.current.pose = pose;
  }, [pose]);

  useEffect(() => {
    stateRef.current.model = model;
  }, [model]);

  useEffect(() => {
    stateRef.current.showOuter = showOuter;
  }, [showOuter]);

  useEffect(() => {
    stateRef.current.autoSpin = autoSpin;
  }, [autoSpin]);

  useEffect(() => {
    stateRef.current.zoom = zoom;
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let disposed = false;
    let rafId = 0;
    let glRenderer: MinecraftWebGLRenderer | null = null;
    let skinCanvas: HTMLCanvasElement | null = null;
    let useSoftware = forceSoftware3D;

    const dprCap = lowPowerMode ? 1.0 : 1.5;

    const resizeCanvas = () => {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const targetW = Math.max(120, Math.floor(rect.width * dpr));
      const targetH = Math.max(140, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    resizeCanvas();

    if (!useSoftware) {
      glRenderer = new MinecraftWebGLRenderer(canvas);
      if (!glRenderer.isReady()) {
        glRenderer.dispose();
        glRenderer = null;
        useSoftware = true;
      }
    }
    setActiveEngine(useSoftware ? 'canvas2d' : 'webgl');

    loadNormalizedSkinCanvas(skinDataUrl)
      .then((normalized) => {
        if (disposed) return;
        skinCanvas = normalized;
        if (glRenderer && glRenderer.isReady()) {
          glRenderer.setSkinCanvas(normalized);
        }
      })
      .catch(() => {
        // gracefully keep clear stage
      });

    let lastFrameMs = performance.now();
    const minFrameIntervalMs = lowPowerMode ? 1000 / 28 : 1000 / 60;

    const tick = (nowMs: number) => {
      if (disposed) return;
      rafId = requestAnimationFrame(tick);

      if (document.hidden) {
        lastFrameMs = nowMs;
        return;
      }

      const deltaMs = nowMs - lastFrameMs;
      if (deltaMs < minFrameIntervalMs) return;
      lastFrameMs = nowMs;

      const dt = Math.min(0.08, deltaMs / 1000);
      const st = stateRef.current;
      st.timeSec += dt;

      if (st.autoSpin && !st.dragging) {
        st.yaw += dt * 0.55;
      }

      if (!skinCanvas) return;

      const renderOpts = {
        model: st.model,
        pose: st.pose,
        yaw: st.yaw,
        pitch: st.pitch,
        zoom: st.zoom,
        showOuter: st.showOuter,
        timeSec: st.timeSec,
        cameraY: 16.2,
        fovDeg: 36,
      };

      if (!useSoftware && glRenderer && glRenderer.isReady()) {
        const ok = glRenderer.render(renderOpts);
        if (!ok) {
          glRenderer.dispose();
          glRenderer = null;
          useSoftware = true;
          setActiveEngine('canvas2d');
        }
      } else {
        renderMinecraftSoftware2D(canvas, skinCanvas, renderOpts);
      }
    };

    rafId = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      if (glRenderer) {
        glRenderer.dispose();
        glRenderer = null;
      }
    };
  }, [skinDataUrl, lowPowerMode, forceSoftware3D]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    stateRef.current.dragging = true;
    stateRef.current.lastX = e.clientX;
    stateRef.current.lastY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stateRef.current.dragging) return;
    const dx = e.clientX - stateRef.current.lastX;
    const dy = e.clientY - stateRef.current.lastY;
    stateRef.current.lastX = e.clientX;
    stateRef.current.lastY = e.clientY;
    stateRef.current.yaw += dx * 0.012;
    stateRef.current.pitch = Math.max(-0.55, Math.min(0.65, stateRef.current.pitch + dy * 0.009));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stateRef.current.dragging = false;
  };

  const resetCamera = () => {
    stateRef.current.yaw = 0.42;
    stateRef.current.pitch = 0.1;
    setZoom(1.02);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-lg border border-[#232938] bg-[#06070a] obsidian-stage-glow ${
          compact ? 'h-64' : 'h-80 sm:h-96'
        }`}
      >
        {/* Subtle floor pedestal ellipse */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-6 left-1/2 h-8 w-44 -translate-x-1/2 rounded-full border border-[#f97316]/25 bg-[#f97316]/8 blur-[2px]"
        />

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="h-full w-full cursor-grab active:cursor-grabbing touch-none select-none"
          aria-label="Interactive 3D Minecraft character viewer. Drag to rotate."
        />

        {/* Top-left subtle model + renderer caption */}
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 text-[11px] font-medium text-slate-400">
          <span>{model === 'slim' ? 'Slim 3px' : 'Classic 4px'}</span>
          <span aria-hidden="true">·</span>
          <span>{activeEngine === 'webgl' ? 'WebGL 3D' : 'Canvas 2D-3D'}</span>
        </div>

        {/* Top-right compact camera tools */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAutoSpin((s) => !s)}
            title={autoSpin ? 'Pause rotation' : 'Auto rotate'}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232938] bg-[#0f1219]/90 text-slate-300 hover:border-[#f97316]/60 hover:text-white transition-colors"
          >
            {autoSpin ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setShowOuter((v) => !v)}
            title="Toggle 3D Outer Skin Layer"
            className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
              showOuter
                ? 'border-[#eab308]/50 bg-[#eab308]/15 text-[#fde047]'
                : 'border-[#232938] bg-[#0f1219]/90 text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.45, +(z + 0.14).toFixed(2)))}
            title="Zoom in"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232938] bg-[#0f1219]/90 text-slate-300 hover:border-[#f97316]/60 hover:text-white transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.14).toFixed(2)))}
            title="Zoom out"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232938] bg-[#0f1219]/90 text-slate-300 hover:border-[#f97316]/60 hover:text-white transition-colors"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={resetCamera}
            title="Reset camera angle"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232938] bg-[#0f1219]/90 text-slate-300 hover:border-[#f97316]/60 hover:text-white transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bottom hint */}
        <div className="pointer-events-none absolute bottom-2.5 left-3 text-[11px] text-slate-500">
          Drag to orbit 360°
        </div>
      </div>

      {/* Pose segmented control */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-lg border border-[#232938] bg-[#0b0e14] p-1">
          {POSES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPose(p.id)}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                pose === p.id
                  ? 'bg-[#f97316] text-[#06070a] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
