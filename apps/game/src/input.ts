import type { ShipCommand } from '@void-frontier/simulation';
import type { Vec2 } from '@void-frontier/kernel';
import { active, firstPad, pressed, readPad, type PadButton, type PadState } from './gamepad.ts';
import { coarsePointer, stickAxes } from './touch.ts';

export interface InputActions {
  toggleFlightMode(): void;
  toggleSteering(): void;
  toggleHelp(): void;
  toggleDebug(): void;
  togglePause(): void;
  scanOrRelaunch(): void;
  dockOrUndock(): void;
  toggleMap(): void;
  toggleFleet(): void;
  cycleAimedSystem(): void;
  toggleDetails(): void;
  jettison(): void;
  cycleQuality(): void;
  cycleTarget(): void;
  zoom(factor: number): void;
  toggleCruise(): void;
  /** Fires a module verb: the afterburner dash, chaff or the EMP pulse. */
  useAbility(kind: 'dash' | 'chaff' | 'emp'): void;
  /** Gamepad d-pad up and down: module verbs when fitted, zoom otherwise. */
  padVerb(direction: 'up' | 'down'): void;
  /** Gamepad B over a menu or panel: close or go back. */
  uiBack(): void;
  /** The player switched between keyboard and mouse and a gamepad. */
  deviceChanged(device: InputDevice): void;
  /** Photo mode on or off (F9). */
  togglePhoto(): void;
  /** Photo mode: save the picture (Enter), or hide the hint (H). */
  photoKey(key: 'shot' | 'hint'): void;
}

export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

/** One-shot controls on the touch HUD. Held axes go through `setTouch` instead. */
export type TouchTap = 'mode' | 'scan' | 'dock' | 'target' | 'fleet' | 'pause' | 'cruise' | 'dash' | 'chaff' | 'emp';

/** Axes and held buttons written by the on-screen sticks. */
export interface TouchState {
  /** -1..1, positive is forward. */
  thrust: number;
  /** -1..1, positive is to the right. */
  strafe: number;
  /** Steer stick, x right and y up, or null when it is released. */
  aim: { x: number; y: number } | null;
  firePrimary: boolean;
  fireSecondary: boolean;
  fireMining: boolean;
  brake: boolean;
  boost: boolean;
}

const emptyTouch = (): TouchState => ({
  thrust: 0,
  strafe: 0,
  aim: null,
  firePrimary: false,
  fireSecondary: false,
  fireMining: false,
  brake: false,
  boost: false,
});

/** One-shot gamepad buttons in flight and the action each calls. */
const PAD_ACTIONS: Partial<Record<PadButton, keyof InputActions>> = {
  a: 'dockOrUndock',
  x: 'scanOrRelaunch',
  y: 'toggleCruise',
  rb: 'cycleTarget',
  rs: 'toggleFlightMode',
  view: 'toggleMap',
  menu: 'togglePause',
  left: 'cycleAimedSystem',
  right: 'toggleFleet',
};

/** Seconds before a held direction repeats in menus, then between repeats. */
const NAV_REPEAT = { delay: 0.35, every: 0.12 };
/** Stick deflection that counts as a menu direction. */
const NAV_STICK = 0.6;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Actions a player can move to another key, with their default physical key codes. */
export const DEFAULT_BINDINGS = {
  thrust: 'KeyW',
  reverse: 'KeyS',
  strafeRight: 'KeyD',
  strafeLeft: 'KeyA',
  turnLeft: 'KeyQ',
  turnRight: 'KeyE',
  mine: 'KeyX',
  scan: 'KeyR',
  jettison: 'KeyK',
  dock: 'KeyF',
  map: 'KeyM',
  fleet: 'KeyO',
  mode: 'KeyC',
  steering: 'KeyV',
  brake: 'Space',
  aimSystem: 'KeyT',
  details: 'KeyI',
  cruise: 'KeyJ',
  dash: 'Digit1',
  chaff: 'Digit2',
  emp: 'Digit3',
} as const;

export type BindingAction = keyof typeof DEFAULT_BINDINGS;
export type Bindings = Record<BindingAction, string>;

/** Keys the browser would otherwise use for scrolling or its own shortcuts. */
const CAPTURED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'Tab', 'AltLeft']);

/**
 * The game's only keyboard and mouse listener. Held keys become a ship command once per
 * frame; one-shot keys call the matching action. Uses physical key codes so WASD works
 * on any keyboard layout.
 */
export class InputController {
  private readonly held = new Set<string>();
  /** Cursor in normalised device coordinates, or null when it is outside the canvas. */
  pointer: { x: number; y: number } | null = null;
  steering = true;
  bindings: Bindings = { ...DEFAULT_BINDINGS };
  /** Photo mode is on: keys move the free camera instead of flying. */
  photo = false;
  /** On-screen sticks and held buttons. */
  private touch: TouchState = emptyTouch();
  /** A finger dragging on the view, steering the way the steer stick does. */
  private canvasSteer: { id: number; x: number; y: number } | null = null;
  private canvasAim: { x: number; y: number } | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event)) return;
    if (CAPTURED.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    // A finger-first device keeps its touch prompts; a keyboard still flies.
    if (!coarsePointer()) this.useDevice('keyboard');
    this.held.add(event.code);
    if (event.code === 'F9') {
      event.preventDefault();
      this.actions.togglePhoto();
      return;
    }
    // In photo mode the keys move the camera; only these do anything else.
    if (this.photo) {
      if (event.code === 'Escape') this.actions.togglePhoto();
      else if (event.code === 'Enter') this.actions.photoKey('shot');
      else if (event.code === 'KeyH') this.actions.photoKey('hint');
      return;
    }
    const bound = this.bindings;
    if (event.code === bound.mode) this.actions.toggleFlightMode();
    else if (event.code === bound.steering) {
      this.steering = !this.steering;
      this.actions.toggleSteering();
    } else if (event.code === bound.scan) this.actions.scanOrRelaunch();
    else if (event.code === bound.jettison) this.actions.jettison();
    else if (event.code === bound.dock) this.actions.dockOrUndock();
    else if (event.code === bound.map) this.actions.toggleMap();
    else if (event.code === bound.fleet) this.actions.toggleFleet();
    else if (event.code === bound.aimSystem) this.actions.cycleAimedSystem();
    else if (event.code === bound.details) this.actions.toggleDetails();
    else if (event.code === bound.cruise) this.actions.toggleCruise();
    else if (event.code === bound.dash) this.actions.useAbility('dash');
    else if (event.code === bound.chaff) this.actions.useAbility('chaff');
    else if (event.code === bound.emp) this.actions.useAbility('emp');
    switch (event.code) {
      case 'KeyH': this.actions.toggleHelp(); break;
      case 'F3':
      case 'Backquote': this.actions.toggleDebug(); break;
      case 'Escape':
      case 'KeyP': this.actions.togglePause(); break;
      case 'KeyG': this.actions.cycleQuality(); break;
      case 'Tab': this.actions.cycleTarget(); break;
      case 'Equal':
      case 'NumpadAdd': this.actions.zoom(1 / 1.15); break;
      case 'Minus':
      case 'NumpadSubtract': this.actions.zoom(1.15); break;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };

  private readonly onBlur = () => {
    this.held.clear();
    this.buttons.clear();
    this.clearTouch();
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      this.steerFromCanvas(event);
      return;
    }
    if (!coarsePointer() && Math.abs(event.movementX) + Math.abs(event.movementY) > 2) this.useDevice('keyboard');
    const rect = this.surface.getBoundingClientRect();
    this.pointer = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
  };

  private readonly onPointerLeave = () => {
    this.pointer = null;
  };

  private readonly buttons = new Set<number>();

  private readonly onPointerDown = (event: PointerEvent) => {
    // A finger on the view steers by dragging. It does not fire: guns are a button.
    if (event.pointerType === 'touch') {
      this.useDevice('touch');
      this.canvasSteer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.surface.setPointerCapture?.(event.pointerId);
      return;
    }
    this.buttons.add(event.button);
    this.surface.setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.canvasSteer?.id === event.pointerId) {
      this.canvasSteer = null;
      this.canvasAim = null;
    }
    this.buttons.delete(event.button);
  };

  private readonly onContextMenu = (event: Event) => event.preventDefault();

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.actions.zoom(event.deltaY > 0 ? 1.1 : 1 / 1.1);
  };

  constructor(private readonly surface: HTMLElement, private readonly actions: InputActions) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerleave', this.onPointerLeave);
    surface.addEventListener('wheel', this.onWheel, { passive: false });
    surface.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('contextmenu', this.onContextMenu);
    if (coarsePointer()) this.useDevice('touch');
  }

  /** Which device the player last used, for button prompts. */
  device: InputDevice = 'keyboard';
  private pad: PadState | null = null;
  private padIndex: number | null = null;
  private nav: { dir: string; next: number } | null = null;

  private useDevice(device: InputDevice): void {
    if (device === this.device) return;
    this.device = device;
    this.actions.deviceChanged(device);
  }

  /** Right stick, the steer stick, or a drag on the view (x right, y up), else null. */
  get stickAim(): { x: number; y: number } | null {
    return this.pad?.aim ?? this.touch.aim ?? this.canvasAim;
  }

  /**
   * Reads the gamepad once a frame. In flight, buttons call the same actions as their
   * keys; over a menu or panel (`ui`), the d-pad and left stick move focus, A presses
   * the focused control and B goes back.
   */
  pollGamepad(now: number, ui: boolean): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = firstPad(pads);
    if (!pad) {
      this.pad = null;
      this.padIndex = null;
      return;
    }
    this.padIndex = pad.index;
    const previous = this.pad;
    const next = readPad(pad);
    this.pad = next;
    if (active(next)) this.useDevice('gamepad');
    const down = pressed(previous, next);
    if (ui) {
      for (const b of down) {
        if (b === 'a') activateFocused();
        else if (b === 'b') this.actions.uiBack();
        else if (b === 'menu') this.actions.togglePause();
        else if (b === 'view') this.actions.toggleMap();
      }
      this.navigate(now, next);
      return;
    }
    this.nav = null;
    for (const b of down) {
      const action = PAD_ACTIONS[b];
      if (action) (this.actions[action] as () => void)();
      else if (b === 'up' || b === 'down') this.actions.padVerb(b);
    }
  }

  /** Menu focus from the d-pad or the left stick, repeating while held. */
  private navigate(now: number, state: PadState): void {
    const dir = state.held.has('up') || state.move.y > NAV_STICK ? 'prev'
      : state.held.has('down') || state.move.y < -NAV_STICK ? 'next'
      : state.held.has('left') || state.move.x < -NAV_STICK ? 'prev'
      : state.held.has('right') || state.move.x > NAV_STICK ? 'next'
      : null;
    if (!dir) {
      this.nav = null;
      return;
    }
    if (this.nav && this.nav.dir === dir && now < this.nav.next) return;
    const first = !this.nav || this.nav.dir !== dir;
    this.nav = { dir, next: now + (first ? NAV_REPEAT.delay : NAV_REPEAT.every) };
    moveFocus(dir === 'next' ? 1 : -1);
  }

  /** Rumble on the pad in use, if it can; strength 0..1. */
  rumble(strength: number, ms: number): void {
    if (this.device !== 'gamepad' || this.padIndex === null) return;
    const pad = navigator.getGamepads?.()[this.padIndex];
    const actuator = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    actuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.6) })?.catch(() => undefined);
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** Brake from the key, the pad or the on-screen button. */
  isBraking(): boolean {
    return this.held.has(this.bindings.brake) || !!this.pad?.held.has('b') || this.touch.brake;
  }

  /** The touch HUD writes held axes and buttons here. They add to the keys, the same way a pad does. */
  setTouch(patch: Partial<TouchState>): void {
    this.touch = { ...this.touch, ...patch };
    this.useDevice('touch');
  }

  /** Drops every on-screen hold, for example when the HUD unmounts or the window blurs. */
  clearTouch(): void {
    this.touch = emptyTouch();
    this.canvasSteer = null;
    this.canvasAim = null;
  }

  /** A tap on an on-screen button runs the same action as its key. */
  tap(action: TouchTap): void {
    this.useDevice('touch');
    if (action === 'mode') this.actions.toggleFlightMode();
    else if (action === 'scan') this.actions.scanOrRelaunch();
    else if (action === 'dock') this.actions.dockOrUndock();
    else if (action === 'target') this.actions.cycleTarget();
    else if (action === 'fleet') this.actions.toggleFleet();
    else if (action === 'pause') this.actions.togglePause();
    else if (action === 'cruise') this.actions.toggleCruise();
    else this.actions.useAbility(action);
  }

  /** Dragging a finger on the view points the nose. The finger never counts as a mouse button. */
  private steerFromCanvas(event: PointerEvent): void {
    this.useDevice('touch');
    if (!this.canvasSteer || this.canvasSteer.id !== event.pointerId) return;
    const axes = stickAxes(event.clientX - this.canvasSteer.x, event.clientY - this.canvasSteer.y, 80);
    this.canvasAim = axes.x === 0 && axes.y === 0 ? null : axes;
  }

  command(aim: Vec2 | null): ShipCommand {
    const axis = (positive: string[], negative: string[]) =>
      (positive.some((code) => this.held.has(code)) ? 1 : 0) - (negative.some((code) => this.held.has(code)) ? 1 : 0);
    const pad = this.pad;
    const padHeld = (b: PadButton) => !!pad?.held.has(b);
    const clampAxis = (v: number) => Math.max(-1, Math.min(1, v));
    return {
      // Keys and the left stick add up; a half-pushed stick is a half throttle.
      thrust: clampAxis(axis([this.bindings.thrust, 'ArrowUp'], [this.bindings.reverse, 'ArrowDown']) + (pad?.move.y ?? 0) + this.touch.thrust),
      strafe: clampAxis(axis([this.bindings.strafeRight, 'ArrowRight'], [this.bindings.strafeLeft, 'ArrowLeft']) + (pad?.move.x ?? 0) + this.touch.strafe),
      turn: axis([this.bindings.turnLeft], [this.bindings.turnRight]),
      // The right stick, the steer stick and a finger drag always steer; the mouse only while steering is on.
      aim: pad?.aim || this.touch.aim || this.canvasAim || this.steering ? aim : null,
      // Left mouse, Ctrl, RT or the Fire button: guns. Right mouse, Alt, LT or Laser: laser.
      firePrimary: this.buttons.has(0) || this.held.has('ControlLeft') || padHeld('rt') || this.touch.firePrimary,
      fireSecondary: this.buttons.has(2) || this.held.has('AltLeft') || padHeld('lt') || this.touch.fireSecondary,
      target: null,
      // Middle mouse, X, LB or the Mine button: mining laser.
      fireMining: this.buttons.has(1) || this.held.has(this.bindings.mine) || padHeld('lb') || this.touch.fireMining,
      targetSystem: null,
      brake: this.held.has(this.bindings.brake) || padHeld('b') || this.touch.brake,
      boost: this.held.has('ShiftLeft') || this.held.has('ShiftRight') || padHeld('ls') || this.touch.boost,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerleave', this.onPointerLeave);
    this.surface.removeEventListener('wheel', this.onWheel);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('contextmenu', this.onContextMenu);
  }
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

/** Visible controls a gamepad can reach, in document order. */
function focusables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function moveFocus(step: number): void {
  const list = focusables();
  if (list.length === 0) return;
  const at = list.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
  list[next].focus({ focusVisible: true } as FocusOptions);
  list[next].scrollIntoView?.({ block: 'nearest' });
}

function activateFocused(): void {
  const el = document.activeElement as HTMLElement | null;
  if (el && el !== document.body && el.matches(FOCUSABLE)) el.click();
  else moveFocus(1);
}
