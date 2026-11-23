import { ANIMATION } from '../config/animation';
import { cubicBezierEase, sampleTween, type CameraPose, type CameraTween } from './cameraMotion';

type FrameListener = {
  callback: (nowMs: number) => void;
  continuous: boolean;
};

const cameraEase = cubicBezierEase(...ANIMATION.CAMERA_EASE_BEZIER);
const listeners = new Map<number, FrameListener>();

let container: HTMLElement | null = null;
let pose: CameraPose = { x: 0, y: 0, zoom: 1 };
let tween: CameraTween | null = null;
let hasTarget = false;
let nextListenerId = 1;
let frameId: number | null = null;

function hasContinuousListener(): boolean {
  return Array.from(listeners.values()).some((listener) => listener.continuous);
}

function shouldRun(): boolean {
  return tween !== null || hasContinuousListener();
}

function writeTransform(): void {
  if (container) {
    container.style.transform = `translate(${pose.x}px, ${pose.y}px) scale(${pose.zoom})`;
  }
}

function stopLoopIfIdle(): void {
  if (shouldRun() || frameId === null) return;
  cancelAnimationFrame(frameId);
  frameId = null;
}

function scheduleFrame(): void {
  if (frameId !== null || !shouldRun() || typeof requestAnimationFrame !== 'function') return;
  frameId = requestAnimationFrame((nowMs) => {
    frameId = null;
    if (tween) {
      const sample = sampleTween(tween, nowMs, cameraEase);
      pose = sample.pose;
      if (sample.done) tween = null;
    }
    writeTransform();
    for (const [id, listener] of listeners) {
      if (listeners.has(id)) listener.callback(nowMs);
    }
    scheduleFrame();
  });
}

export function attachCameraContainer(el: HTMLElement | null): void {
  container = el;
  if (!el) {
    tween = null;
    stopLoopIfIdle();
    return;
  }
  writeTransform();
  scheduleFrame();
}

export function setCameraTarget(
  target: CameraPose,
  options: { animate: boolean; durationMs: number },
): void {
  if (!options.animate || !hasTarget || options.durationMs <= 0) {
    pose = target;
    tween = null;
    hasTarget = true;
    writeTransform();
    stopLoopIfIdle();
    return;
  }

  tween = {
    from: pose,
    to: target,
    startMs: performance.now(),
    durationMs: options.durationMs,
  };
  hasTarget = true;
  scheduleFrame();
}

export function getCameraPose(): CameraPose {
  return pose;
}

export function addCameraFrameListener(
  listener: (nowMs: number) => void,
  options: { continuous?: boolean } = {},
): () => void {
  const id = nextListenerId++;
  listeners.set(id, { callback: listener, continuous: options.continuous === true });
  scheduleFrame();
  return () => {
    listeners.delete(id);
    stopLoopIfIdle();
  };
}
