import { useEffect, useMemo, useState } from 'react';
import { ANIMATION } from '../../config/animation';
import { computeFlyToHudControlPoint, quadraticBezierPoint, type ScreenPoint } from '../flyToHud';
import { useFlyToHudStore, type FlyToHudFlight } from '../flyToHudStore';
import './FlyToHudLayer.css';

function centerOfElement(element: Element): ScreenPoint {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function FlyToHudSprite({ flight }: { flight: FlyToHudFlight }) {
  const removeFlight = useFlyToHudStore((s) => s.removeFlight);
  const [point, setPoint] = useState<ScreenPoint>({ x: flight.fromScreenX, y: flight.fromScreenY });
  const [opacity, setOpacity] = useState(1);

  const from = useMemo<ScreenPoint>(
    () => ({ x: flight.fromScreenX, y: flight.fromScreenY }),
    [flight.fromScreenX, flight.fromScreenY],
  );

  useEffect(() => {
    const targetEl = document.querySelector(flight.targetSelector);
    if (!targetEl) {
      removeFlight(flight.id);
      return;
    }
    const to = centerOfElement(targetEl);
    const control = computeFlyToHudControlPoint(from, to, ANIMATION.FLY_TO_HUD_CURVE_OFFSET_RATIO);
    let raf = 0;
    let startTs: number | null = null;

    const finish = () => {
      const pulseClass = 'hud-target--pulse';
      targetEl.classList.add(pulseClass);
      setTimeout(() => targetEl.classList.remove(pulseClass), ANIMATION.FLY_TO_HUD_TARGET_PULSE_MS);

      if (flight.targetSelector === '[data-hud-target="ember"]') {
        const flashClass = 'hud-target--ember-flash';
        targetEl.classList.add(flashClass);
        setTimeout(() => targetEl.classList.remove(flashClass), ANIMATION.EMBER_HUD_FLASH_MS);
      }

      flight.onArrival?.();
      removeFlight(flight.id);
    };

    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const raw = Math.min(1, (ts - startTs) / ANIMATION.FLY_TO_HUD_DURATION_MS);
      const eased = raw * raw;
      setPoint(quadraticBezierPoint(from, control, to, eased));
      setOpacity(1 - raw * 0.15);
      if (raw >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [flight.id, flight.targetSelector, from, removeFlight]);

  return (
    <span
      className="fly-to-hud-emoji"
      style={{
        left: point.x,
        top: point.y,
        opacity,
      }}
    >
      {flight.emoji}
    </span>
  );
}

export default function FlyToHudLayer() {
  const flights = useFlyToHudStore((s) => s.flights);
  if (flights.length === 0) return null;
  return (
    <div className="fly-to-hud-layer">
      {flights.map((flight) => (
        <FlyToHudSprite key={flight.id} flight={flight} />
      ))}
    </div>
  );
}
