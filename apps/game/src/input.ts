import type { ShipCommand } from '@void-frontier/simulation';
import type { Vec2 } from '@void-frontier/kernel';

export interface InputActions {
  toggleFlightMode(): void;
  toggleSteering(): void;
  toggleHelp(): void;
  toggleDebug(): void;
  togglePause(): void;
  scanOrRelaunch(): void;
  jettison(): void;
  cycleQuality(): void;
  cycleTarget(): void;
  zoom(factor: number): void;
}

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

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event)) return;
    if (CAPTURED.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.held.add(event.code);
    switch (event.code) {
      case 'KeyC': this.actions.toggleFlightMode(); break;
      case 'KeyV': this.steering = !this.steering; this.actions.toggleSteering(); break;
      case 'KeyH': this.actions.toggleHelp(); break;
      case 'F3':
      case 'Backquote': this.actions.toggleDebug(); break;
      case 'Escape':
      case 'KeyP': this.actions.togglePause(); break;
      case 'KeyR': this.actions.scanOrRelaunch(); break;
      case 'KeyK': this.actions.jettison(); break;
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
  };

  private readonly onPointerMove = (event: PointerEvent) => {
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
    this.buttons.add(event.button);
    this.surface.setPointerCapture?.(event.pointerId);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
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
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  command(aim: Vec2 | null): ShipCommand {
    const axis = (positive: string[], negative: string[]) =>
      (positive.some((code) => this.held.has(code)) ? 1 : 0) - (negative.some((code) => this.held.has(code)) ? 1 : 0);
    return {
      thrust: axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']),
      strafe: axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']),
      turn: axis(['KeyQ'], ['KeyE']),
      aim: this.steering ? aim : null,
      // Left mouse or Ctrl: guns. Right mouse or Alt: laser.
      firePrimary: this.buttons.has(0) || this.held.has('ControlLeft'),
      fireSecondary: this.buttons.has(2) || this.held.has('AltLeft'),
      target: null,
      // Middle mouse or X: mining laser.
      fireMining: this.buttons.has(1) || this.held.has('KeyX'),
      brake: this.held.has('Space'),
      boost: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
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
