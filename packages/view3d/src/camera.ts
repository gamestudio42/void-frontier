import { PerspectiveCamera, Vector3 } from 'three';

export interface CameraSettings {
  fov: number;
  /** degrees above the flight plane */
  tilt: number;
  /** metres from the focus point at zoom 1 */
  distance: number;
  minZoom: number;
  maxZoom: number;
  /** seconds; time constant of the follow smoothing */
  smoothing: number;
  /** seconds of travel the camera looks ahead of the ship */
  lookAhead: number;
  maxLookAhead: number;
}

export const DEFAULT_CAMERA: CameraSettings = {
  fov: 50,
  tilt: 55,
  distance: 170,
  minZoom: 0.5,
  maxZoom: 3.5,
  smoothing: 0.15,
  lookAhead: 0.6,
  maxLookAhead: 120,
};

/**
 * Follows the ship from above at a fixed tilt. It does not rotate with the ship, leads
 * the view in the direction of travel and pulls back as speed grows.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly focus = new Vector3();
  private readonly desired = new Vector3();
  private zoom = 1;
  private speedZoom = 1;
  private initialised = false;
  private trauma = 0;
  private combatZoom = 1;
  private time = 0;
  private readonly lookTarget = new Vector3();

  constructor(readonly settings: CameraSettings = DEFAULT_CAMERA) {
    this.camera = new PerspectiveCamera(settings.fov, 1, 1, 20000);
  }

  get zoomLevel(): number {
    return this.zoom;
  }

  /** Multiply the zoom (wheel); > 1 moves the camera away. */
  zoomBy(factor: number): void {
    this.zoom = Math.min(this.settings.maxZoom, Math.max(this.settings.minZoom, this.zoom * factor));
  }

  /** Add camera shake; 0..1, decays over about a second. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * `target` and `velocity` are in scene units (XZ plane). `frame` is an optional second
   * point to keep in view (the combat target): the camera eases back and shifts toward it.
   */
  update(target: Vector3, velocity: Vector3, frameDt: number, frame: Vector3 | null = null): Vector3 {
    const s = this.settings;
    const speed = Math.hypot(velocity.x, velocity.z);
    const lead = Math.min(s.maxLookAhead, speed * s.lookAhead);
    const scale = speed > 0.01 ? lead / speed : 0;
    this.desired.set(target.x + velocity.x * scale, 0, target.z + velocity.z * scale);
    let wantedCombatZoom = 1;
    if (frame) {
      const gap = Math.hypot(frame.x - target.x, frame.z - target.z);
      this.desired.x += (frame.x - this.desired.x) * 0.45;
      this.desired.z += (frame.z - this.desired.z) * 0.45;
      wantedCombatZoom = Math.min(3, Math.max(1, (gap * 1.7) / s.distance));
    }
    this.combatZoom += (wantedCombatZoom - this.combatZoom) * (this.initialised ? 1 - Math.exp(-frameDt / 0.8) : 1);

    const blend = this.initialised ? 1 - Math.exp(-frameDt / s.smoothing) : 1;
    this.focus.lerp(this.desired, blend);
    const targetSpeedZoom = 1 + Math.min(0.9, speed / 250);
    this.speedZoom += (targetSpeedZoom - this.speedZoom) * (this.initialised ? 1 - Math.exp(-frameDt / 0.6) : 1);
    this.initialised = true;

    const distance = s.distance * this.zoom * Math.max(this.speedZoom, this.combatZoom);
    const tilt = (s.tilt * Math.PI) / 180;
    this.camera.position.set(this.focus.x, this.focus.y + Math.sin(tilt) * distance, this.focus.z + Math.cos(tilt) * distance);
    this.lookTarget.copy(this.focus);

    // Trauma-based shake: squared so small bumps stay subtle and crashes hit hard.
    this.time += frameDt;
    this.trauma = Math.max(0, this.trauma - frameDt * 1.2);
    if (this.trauma > 0) {
      const strength = this.trauma * this.trauma * distance * 0.035;
      const t = this.time * 31;
      const ox = (Math.sin(t * 1.1) + Math.sin(t * 2.7 + 1.3) * 0.5) * strength;
      const oz = (Math.sin(t * 1.7 + 2.1) + Math.sin(t * 3.1) * 0.5) * strength;
      this.camera.position.x += ox;
      this.camera.position.z += oz;
      this.lookTarget.x += ox * 0.6;
      this.lookTarget.z += oz * 0.6;
    }
    this.camera.lookAt(this.lookTarget);
    return this.focus;
  }
}
