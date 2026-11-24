import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { MessageKey, Translate } from '../i18n.ts';
import type { InputController } from '../input.ts';
import { stickAxes } from '../touch.ts';

interface TouchControlsProps {
  input: InputController;
  t: Translate;
  /** Module verbs fitted on the ship, so their buttons only show when they exist. */
  verbs: Array<'dash' | 'chaff' | 'emp'>;
}

/**
 * On-screen flight controls for a finger. The sticks and buttons write the same
 * ship command the keys do; a mouse on a desktop never sees this layer.
 */
export function TouchControls({ input, t, verbs }: TouchControlsProps) {
  useEffect(() => () => input.clearTouch(), [input]);
  return (
    <div className="touch-controls" data-testid="touch-controls">
      <Stick testId="touch-throttle" label={t('ui.touch.throttle')} onAxes={(axes) => input.setTouch({ thrust: axes?.y ?? 0, strafe: axes?.x ?? 0 })} />
      <Stick testId="touch-steer" label={t('ui.touch.steer')} onAxes={(axes) => input.setTouch({ aim: axes })} />
      <div className="touch-actions">
        <Hold testId="touch-fire" label={t('ui.touch.fire')} onHold={(down) => input.setTouch({ firePrimary: down })} />
        <Hold testId="touch-brake" label={t('ui.touch.brake')} onHold={(down) => input.setTouch({ brake: down })} />
        <Hold testId="touch-laser" label={t('ui.touch.laser')} onHold={(down) => input.setTouch({ fireSecondary: down })} />
        <Hold testId="touch-mine" label={t('ui.touch.mine')} onHold={(down) => input.setTouch({ fireMining: down })} />
        <Hold testId="touch-boost" label={t('ui.touch.boost')} onHold={(down) => input.setTouch({ boost: down })} />
        <Tap testId="touch-mode" label={t('ui.touch.mode')} onTap={() => input.tap('mode')} />
        <Tap testId="touch-scan" label={t('ui.touch.scan')} onTap={() => input.tap('scan')} />
        <Tap testId="touch-dock" label={t('ui.touch.dock')} onTap={() => input.tap('dock')} />
        <Tap testId="touch-target" label={t('ui.touch.target')} onTap={() => input.tap('target')} />
        <Tap testId="touch-fleet" label={t('ui.touch.fleet')} onTap={() => input.tap('fleet')} />
        <Tap testId="touch-cruise" label={t('ui.touch.cruise')} onTap={() => input.tap('cruise')} />
        <Tap testId="touch-pause" label={t('ui.touch.pause')} onTap={() => input.tap('pause')} />
        {verbs.map((kind) => (
          <Tap key={kind} testId={`touch-${kind}`} label={t(`ui.touch.${kind}` as MessageKey)} onTap={() => input.tap(kind)} />
        ))}
      </div>
    </div>
  );
}

function capture(event: ReactPointerEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // A synthetic event has no pointer to capture; the buttons still read the down and up.
  }
}

function Stick({ testId, label, onAxes }: { testId: string; label: string; onAxes: (axes: { x: number; y: number } | null) => void }) {
  const knob = useRef<HTMLSpanElement>(null);
  const origin = useRef<{ id: number; x: number; y: number } | null>(null);
  const place = (dx: number, dy: number) => {
    const reach = 36;
    const scale = Math.hypot(dx, dy) || 1;
    const limited = Math.min(reach, scale) / scale;
    if (knob.current) knob.current.style.transform = `translate(${dx * limited}px, ${dy * limited}px)`;
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!origin.current || origin.current.id !== event.pointerId) return;
    origin.current = null;
    place(0, 0);
    onAxes(null);
  };
  return (
    <div
      className={`touch-stick ${testId}`}
      data-testid={testId}
      role="slider"
      aria-label={label}
      aria-valuemin={-1}
      aria-valuemax={1}
      onPointerDown={(event) => {
        capture(event);
        origin.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        onAxes(null);
      }}
      onPointerMove={(event) => {
        if (!origin.current || origin.current.id !== event.pointerId) return;
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        place(dx, dy);
        const axes = stickAxes(dx, dy);
        onAxes(axes.x === 0 && axes.y === 0 ? null : axes);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span ref={knob} className="touch-knob" />
      <span className="touch-stick-label">{label}</span>
    </div>
  );
}

function Hold({ testId, label, onHold }: { testId: string; label: string; onHold: (down: boolean) => void }) {
  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onHold(false);
  };
  return (
    <button type="button" data-testid={testId} aria-label={label} onPointerDown={(event) => { capture(event); onHold(true); }} onPointerUp={release} onPointerCancel={release}>
      {label}
    </button>
  );
}

function Tap({ testId, label, onTap }: { testId: string; label: string; onTap: () => void }) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onPointerDown={(event) => {
        capture(event);
        start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const began = start.current;
        start.current = null;
        if (!began || began.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - began.x, event.clientY - began.y) > 28) return;
        onTap();
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {label}
    </button>
  );
}
