import { useEffect, useRef, type RefObject } from 'react';
import { getLavaAdvanceInterval } from '../gameConfig';
import { TERRAIN_RENDER } from '../../config/terrain';
import { MAP } from '../../config/map';
import { useGameStore } from '../gameStore';
import { useGraphicsOptionsStore, isReducedMotion } from '../graphicsOptionsStore';
import { GridLineMode, GraphicsQuality } from '../types';
import { encodeTerrainMap } from '../terrain/terrainMapEncoding';
import { useTerrainRenderStore } from '../terrain/terrainRenderStore';
import { getTerrainLook } from '../terrain/terrainLook';
import { useTerrainTuningStore } from '../terrain/terrainTuningStore';
import { createTerrainRenderer, type TerrainRenderer } from '../terrain/terrainRenderer';

interface TerrainCanvasProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
}

interface RenderOptions {
  quality: typeof GraphicsQuality.HIGH | typeof GraphicsQuality.SAVER | typeof GraphicsQuality.BASIC;
  gridLines: typeof GridLineMode[keyof typeof GridLineMode];
  look: ReturnType<typeof getTerrainLook>;
  revision: number;
}

export default function TerrainCanvas({ viewportRef, containerRef }: TerrainCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TerrainRenderer | null>(null);
  const mapRef = useRef<Uint8Array<ArrayBufferLike>>(new Uint8Array(MAP.GRID_WIDTH * MAP.GRID_HEIGHT * 4));
  const mapVersionRef = useRef(0);
  const forceDrawRef = useRef(true);
  const quality = useGraphicsOptionsStore((state) => state.quality);
  const gridLines = useGraphicsOptionsStore((state) => state.gridLines);
  const grid = useGameStore((state) => state.grid);
  const lavaFrontRow = useGameStore((state) => state.lavaFrontRow);
  const difficulty = useGameStore((state) => state.difficulty);
  const revision = useTerrainTuningStore((state) => state.revision);
  const look = getTerrainLook();
  const optionsRef = useRef<RenderOptions>({
    quality,
    gridLines,
    look,
    revision,
  });

  useEffect(() => {
    optionsRef.current = { quality, gridLines, look, revision };
    forceDrawRef.current = true;
  }, [quality, gridLines, look, revision]);

  useEffect(() => {
    mapRef.current = encodeTerrainMap(
      grid,
      lavaFrontRow,
      getLavaAdvanceInterval(difficulty),
      mapRef.current,
    );
    mapVersionRef.current++;
    rendererRef.current?.setMap(mapRef.current);
    forceDrawRef.current = true;
  }, [grid, lavaFrontRow, difficulty]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

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
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [quality, viewportRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const initialRenderer = createTerrainRenderer(canvas);
    if (!initialRenderer) {
      useTerrainRenderStore.getState().markWebglUnavailable();
      return;
    }
    rendererRef.current = initialRenderer;
    initialRenderer.setMap(mapRef.current);

    let frameId = 0;
    let lastDrawAt = 0;
    let lastSignature = '';
    let lastLook: RenderOptions['look'] | null = null;
    let lost = false;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;

    const onContextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(
        () => useTerrainRenderStore.getState().markWebglUnavailable(),
        TERRAIN_RENDER.CONTEXT_RESTORE_TIMEOUT_MS,
      );
    };
    const onContextRestored = () => {
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      restoreTimer = null;
      rendererRef.current?.dispose();
      rendererRef.current = createTerrainRenderer(canvas);
      if (!rendererRef.current) {
        useTerrainRenderStore.getState().markWebglUnavailable();
        return;
      }
      rendererRef.current.setMap(mapRef.current);
      lost = false;
      forceDrawRef.current = true;
    };
    const onVisibilityChange = () => {
      if (!document.hidden) forceDrawRef.current = true;
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const drawFrame = (now: number) => {
      if (!document.hidden && !lost && rendererRef.current) {
        const viewport = viewportRef.current;
        const container = containerRef.current;
        if (viewport && container) {
          const viewportRect = viewport.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const options = optionsRef.current;
          const dpr = canvas.width / Math.max(1, viewport.clientWidth);
          const reducedMotion = isReducedMotion();
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
          const changed = forceDrawRef.current || signature !== lastSignature || options.look !== lastLook;
          const fps = options.quality === GraphicsQuality.SAVER
            ? TERRAIN_RENDER.QUALITY.SAVER.ANIM_FPS
            : TERRAIN_RENDER.QUALITY.HIGH.ANIM_FPS;
          const interval = 1000 / fps;
          if (changed || (!reducedMotion && now - lastDrawAt >= interval)) {
            rendererRef.current.render({
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
            });
            lastDrawAt = now;
            lastSignature = signature;
            lastLook = options.look;
            forceDrawRef.current = false;
          }
        }
      }
      frameId = requestAnimationFrame(drawFrame);
    };
    frameId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(frameId);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [containerRef, viewportRef]);

  return <canvas ref={canvasRef} className="terrain-canvas" aria-hidden="true" />;
}
