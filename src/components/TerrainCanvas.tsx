import { useEffect, useRef, type RefObject } from 'react';
import { getLavaAdvanceInterval } from '../gameConfig';
import { TERRAIN_RENDER } from '../../config/terrain';
import { MAP } from '../../config/map';
import { useGameStore } from '../gameStore';
import { useGraphicsOptionsStore, isReducedMotion } from '../graphicsOptionsStore';
import { GridLineMode, GraphicsQuality } from '../types';
import { encodeTerrainMap } from '../terrain/terrainMapEncoding';
import { fogValueAt, isFogFree, planFogLift, snapshotRevealed } from '../terrain/fogLift';
import { useTerrainRenderStore } from '../terrain/terrainRenderStore';
import { getTerrainLook } from '../terrain/terrainLook';
import { useTerrainTuningStore } from '../terrain/terrainTuningStore';
import { createTerrainRenderer, type TerrainRenderer } from '../terrain/terrainRenderer';
import { addCameraFrameListener } from '../cameraRig';
import { getLavaFlowProgress, useTerrainTransitionStore } from '../terrain/terrainTransitionStore';

interface TerrainCanvasProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  fogCanvasRef: RefObject<HTMLCanvasElement | null>;
}

interface RenderOptions {
  quality: typeof GraphicsQuality.HIGH | typeof GraphicsQuality.SAVER | typeof GraphicsQuality.BASIC;
  gridLines: typeof GridLineMode[keyof typeof GridLineMode];
  look: ReturnType<typeof getTerrainLook>;
  revision: number;
}

export default function TerrainCanvas({ viewportRef, containerRef, fogCanvasRef }: TerrainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TerrainRenderer | null>(null);
  const fogRendererRef = useRef<TerrainRenderer | null>(null);
  const lavaFlowRef = useRef(useTerrainTransitionStore.getState().lavaFlow);
  const mapRef = useRef<Uint8Array<ArrayBufferLike>>(new Uint8Array(MAP.GRID_WIDTH * MAP.GRID_HEIGHT * 4));
  const mapVersionRef = useRef(0);
  const forceDrawRef = useRef(true);
  const prevRevealedRef = useRef<Uint8Array | null>(null);
  const liftStartsRef = useRef(new Map<number, number>());
  const quality = useGraphicsOptionsStore((state) => state.quality);
  const gridLines = useGraphicsOptionsStore((state) => state.gridLines);
  const grid = useGameStore((state) => state.grid);
  const lavaFrontRow = useGameStore((state) => state.lavaFrontRow);
  const difficulty = useGameStore((state) => state.difficulty);
  const lavaFlow = useTerrainTransitionStore((state) => state.lavaFlow);
  const revision = useTerrainTuningStore((state) => state.revision);
  const look = getTerrainLook();
  const optionsRef = useRef<RenderOptions>({
    quality,
    gridLines,
    look,
    revision,
  });

  useEffect(() => {
    lavaFlowRef.current = lavaFlow;
    forceDrawRef.current = true;
  }, [lavaFlow]);

  useEffect(() => {
    optionsRef.current = { quality, gridLines, look, revision };
    forceDrawRef.current = true;
  }, [quality, gridLines, look, revision]);

  useEffect(() => {
    const nowMs = performance.now();
    const lifting = liftStartsRef.current;
    if (isReducedMotion()) {
      lifting.clear();
    } else {
      for (const [index, startMs] of planFogLift(
        prevRevealedRef.current,
        grid,
        nowMs,
        lifting,
        lavaFlow?.row,
      )) {
        lifting.set(index, startMs);
      }
    }
    prevRevealedRef.current = snapshotRevealed(
      grid,
      prevRevealedRef.current ?? undefined,
      lavaFlow?.row,
    );
    const fog = new Map<number, number>();
    for (const [index, startMs] of lifting) {
      const x = index % MAP.GRID_WIDTH;
      const y = Math.floor(index / MAP.GRID_WIDTH);
      const tile = grid[y]?.[x];
      if (!tile || !isFogFree(tile, y, lavaFlow?.row)) {
        lifting.delete(index);
        continue;
      }
      fog.set(index, fogValueAt(startMs, nowMs));
    }
    mapRef.current = encodeTerrainMap(
      grid,
      lavaFrontRow,
      getLavaAdvanceInterval(difficulty),
      mapRef.current,
      { fog, lavaFlowRow: lavaFlow?.row },
    );
    mapVersionRef.current++;
    rendererRef.current?.setMap(mapRef.current);
    fogRendererRef.current?.setMap(mapRef.current);
    forceDrawRef.current = true;
  }, [grid, lavaFrontRow, difficulty, lavaFlow?.row]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const fogCanvas = fogCanvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !fogCanvas || !viewport) return;

    const qualityOptions = optionsRef.current.quality === GraphicsQuality.SAVER
      ? TERRAIN_RENDER.QUALITY.SAVER
      : TERRAIN_RENDER.QUALITY.HIGH;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, qualityOptions.MAX_DPR);
      const width = Math.max(1, Math.round(viewport.clientWidth * dpr));
      const height = Math.max(1, Math.round(viewport.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        forceDrawRef.current = true;
      }
      if (fogCanvas.width !== width || fogCanvas.height !== height) {
        fogCanvas.width = width;
        fogCanvas.height = height;
        forceDrawRef.current = true;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fogCanvasRef, quality, viewportRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const fogCanvas = fogCanvasRef.current;
    if (!canvas || !fogCanvas) return;
    const initialRenderer = createTerrainRenderer(canvas);
    const initialFogRenderer = createTerrainRenderer(fogCanvas, 'fog');
    if (!initialRenderer || !initialFogRenderer) {
      initialRenderer?.dispose();
      initialFogRenderer?.dispose();
      useTerrainRenderStore.getState().markWebglUnavailable();
      return;
    }
    rendererRef.current = initialRenderer;
    fogRendererRef.current = initialFogRenderer;
    initialRenderer.setMap(mapRef.current);
    initialFogRenderer.setMap(mapRef.current);

    let lastDrawAt = 0;
    let lastSignature = '';
    let lastLook: RenderOptions['look'] | null = null;
    const lostCanvases = new Set<HTMLCanvasElement>();
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    const onContextLost = (event: Event) => {
      event.preventDefault();
      lostCanvases.add(event.currentTarget as HTMLCanvasElement);
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(
        () => useTerrainRenderStore.getState().markWebglLost(),
        TERRAIN_RENDER.CONTEXT_RESTORE_TIMEOUT_MS,
      );
    };
    const onContextRestored = (event: Event) => {
      const restoredCanvas = event.currentTarget as HTMLCanvasElement;
      const isFogCanvas = restoredCanvas === fogCanvas;
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      const currentRenderer = isFogCanvas ? fogRendererRef.current : rendererRef.current;
      currentRenderer?.dispose();
      const restoredRenderer = createTerrainRenderer(restoredCanvas, isFogCanvas ? 'fog' : 'terrain');
      if (!restoredRenderer) {
        useTerrainRenderStore.getState().markWebglLost();
        return;
      }
      if (isFogCanvas) fogRendererRef.current = restoredRenderer;
      else rendererRef.current = restoredRenderer;
      restoredRenderer.setMap(mapRef.current);
      lostCanvases.delete(restoredCanvas);
      if (lostCanvases.size === 0) {
        restoreTimer = null;
      } else {
        restoreTimer = setTimeout(
          () => useTerrainRenderStore.getState().markWebglLost(),
          TERRAIN_RENDER.CONTEXT_RESTORE_TIMEOUT_MS,
        );
      }
      forceDrawRef.current = true;
    };
    const onVisibilityChange = () => {
      if (!document.hidden) forceDrawRef.current = true;
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    fogCanvas.addEventListener('webglcontextlost', onContextLost);
    fogCanvas.addEventListener('webglcontextrestored', onContextRestored);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const drawFrame = (now: number) => {
      let updatedFog = false;
      const reducedMotion = isReducedMotion();
      if (reducedMotion && liftStartsRef.current.size > 0) {
        for (const index of liftStartsRef.current.keys()) mapRef.current[index * 4 + 2] = 0;
        liftStartsRef.current.clear();
        updatedFog = true;
      } else {
        for (const [index, startMs] of liftStartsRef.current) {
          const value = fogValueAt(startMs, now);
          mapRef.current[index * 4 + 2] = value;
          updatedFog = true;
          if (value === 0) liftStartsRef.current.delete(index);
        }
      }
      if (updatedFog) {
        mapVersionRef.current++;
        rendererRef.current?.setMap(mapRef.current);
        fogRendererRef.current?.setMap(mapRef.current);
        forceDrawRef.current = true;
      }
      if (!document.hidden && lostCanvases.size === 0 && rendererRef.current && fogRendererRef.current) {
        const viewport = viewportRef.current;
        const container = containerRef.current;
        if (viewport && container) {
          const viewportRect = viewport.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const options = optionsRef.current;
          const dpr = canvas.width / Math.max(1, viewport.clientWidth);
          const signature = [
            containerRect.left,
            containerRect.top,
            containerRect.width,
            containerRect.height,
            viewportRect.left,
            viewportRect.top,
            canvas.width,
            canvas.height,
            dpr,
            mapVersionRef.current,
            options.gridLines,
            options.quality,
            options.revision,
            reducedMotion,
          ].join('|');
          const currentFlow = lavaFlowRef.current;
          const flowActive = !!currentFlow && !reducedMotion;
          const changed = forceDrawRef.current || signature !== lastSignature || options.look !== lastLook || flowActive;
          const fps = options.quality === GraphicsQuality.SAVER
            ? TERRAIN_RENDER.QUALITY.SAVER.ANIM_FPS
            : TERRAIN_RENDER.QUALITY.HIGH.ANIM_FPS;
          const interval = 1000 / fps;
          if (changed || (!reducedMotion && now - lastDrawAt >= interval)) {
            const lavaFlowUniform: [number, number] = flowActive
              ? [currentFlow.row, Math.max(getLavaFlowProgress(currentFlow, now), 1e-4)]
              : [0, 0];
            const frame = {
              widthPx: canvas.width,
              heightPx: canvas.height,
              offsetCss: {
                x: containerRect.left - viewportRect.left,
                y: containerRect.top - viewportRect.top,
              },
              tileCss: containerRect.width / MAP.GRID_WIDTH,
              dpr,
              timeS: (now / 1000) % TERRAIN_RENDER.TIME_WRAP_S,
              animate: !reducedMotion,
              look: options.look,
              gridAlpha: options.gridLines === GridLineMode.OFF
                ? 0
                : TERRAIN_RENDER.GRID_ALPHA_SHADER[options.gridLines],
              fogSplit: true,
              lavaFlow: lavaFlowUniform,
            };
            rendererRef.current.render(frame);
            fogRendererRef.current.render(frame);
            lastDrawAt = now;
            lastSignature = signature;
            lastLook = options.look;
            forceDrawRef.current = false;
          }
        }
      }
    };
    const removeCameraFrameListener = addCameraFrameListener(drawFrame, { continuous: true });

    return () => {
      removeCameraFrameListener();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      fogCanvas.removeEventListener('webglcontextlost', onContextLost);
      fogCanvas.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      rendererRef.current?.dispose();
      fogRendererRef.current?.dispose();
      rendererRef.current = null;
      fogRendererRef.current = null;
    };
  }, [containerRef, fogCanvasRef, viewportRef]);

  return <canvas ref={canvasRef} className="terrain-canvas" aria-hidden="true" />;
}
