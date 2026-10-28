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
  distance: 120,
  minZoom: 0.5,
  maxZoom: 2,
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

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** `target` and `velocity` are in scene units (XZ plane). */
  update(target: Vector3, velocity: Vector3, frameDt: number): Vector3 {
    const s = this.settings;
    const speed = Math.hypot(velocity.x, velocity.z);
    const lead = Math.min(s.maxLookAhead, speed * s.lookAhead);
    const scale = speed > 0.01 ? lead / speed : 0;
    this.desired.set(target.x + velocity.x * scale, 0, target.z + velocity.z * scale);

    const blend = this.initialised ? 1 - Math.exp(-frameDt / s.smoothing) : 1;
    this.focus.lerp(this.desired, blend);
    const targetSpeedZoom = 1 + Math.min(0.9, speed / 250);
    this.speedZoom += (targetSpeedZoom - this.speedZoom) * (this.initialised ? 1 - Math.exp(-frameDt / 0.6) : 1);
    this.initialised = true;

    const distance = s.distance * this.zoom * this.speedZoom;
    const tilt = (s.tilt * Math.PI) / 180;
    this.camera.position.set(this.focus.x, this.focus.y + Math.sin(tilt) * distance, this.focus.z + Math.cos(tilt) * distance);
    this.camera.lookAt(this.focus);
    return this.focus;
  }
}
