import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCameraFrameListener,
  attachCameraContainer,
  getCameraPose,
  setCameraTarget,
} from '../cameraRig';

type FrameCallback = (nowMs: number) => void;
type FakeElement = { style: { transform?: string } };

let frames: Map<number, FrameCallback>;
let nextFrameId: number;
let clock: number;
let element: FakeElement;

function runFrame(nowMs: number): void {
  const [id, callback] = frames.entries().next().value ?? [];
  expect(callback).toBeDefined();
  frames.delete(id as number);
  callback!(nowMs);
}

describe('camera rig', () => {
  beforeEach(() => {
    frames = new Map();
    nextFrameId = 0;
    clock = 0;
    element = { style: {} };
    vi.stubGlobal('requestAnimationFrame', (callback: FrameCallback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    attachCameraContainer(null);
    setCameraTarget({ x: 0, y: 0, zoom: 1 }, { animate: false, durationMs: 0 });
    attachCameraContainer(element as HTMLElement);
  });

  afterEach(() => {
    attachCameraContainer(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('writes the transform before notifying frame listeners', () => {
    const observed: string[] = [];
    addCameraFrameListener(() => observed.push(element.style.transform ?? ''));
    setCameraTarget({ x: 100, y: 50, zoom: 2 }, { animate: true, durationMs: 100 });

    runFrame(50);

    expect(observed).toHaveLength(1);
    expect(observed[0]).toBe(element.style.transform);
    expect(element.style.transform).toContain('translate(50px, 25px) scale(1.5)');
  });

  it('writes an instant target synchronously', () => {
    setCameraTarget({ x: 4, y: 8, zoom: 1.5 }, { animate: false, durationMs: 100 });

    expect(element.style.transform).toBe('translate(4px, 8px) scale(1.5)');
    expect(getCameraPose()).toEqual({ x: 4, y: 8, zoom: 1.5 });
  });

  it('retargets from the most recently sampled pose', () => {
    setCameraTarget({ x: 100, y: 0, zoom: 1 }, { animate: true, durationMs: 100 });
    runFrame(50);
    const sampledX = getCameraPose().x;
    clock = 50;
    setCameraTarget({ x: 200, y: 0, zoom: 1 }, { animate: true, durationMs: 100 });
    runFrame(100);

    expect(getCameraPose().x).toBeCloseTo(sampledX + (200 - sampledX) * 0.5);
  });

  it('keeps the loop active only for tweens or continuous listeners', () => {
    const removeListener = addCameraFrameListener(() => {});
    expect(frames.size).toBe(0);
    removeListener();

    const removeContinuousListener = addCameraFrameListener(() => {}, { continuous: true });
    expect(frames.size).toBe(1);
    runFrame(10);
    expect(frames.size).toBe(1);
    removeContinuousListener();
    expect(frames.size).toBe(0);

    setCameraTarget({ x: 20, y: 0, zoom: 1 }, { animate: true, durationMs: 10 });
    expect(frames.size).toBe(1);
    runFrame(clock + 10);
    expect(frames.size).toBe(0);
  });
});
