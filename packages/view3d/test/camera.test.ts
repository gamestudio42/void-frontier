import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, DEFAULT_CAMERA } from '../src/camera.ts';

/** Share of the screen height a ship of `length` metres covers at the rig's current distance. */
function screenShare(rig: CameraRig, length: number): number {
  const distance = DEFAULT_CAMERA.distance * rig.viewScale;
  return length / (2 * distance * Math.tan((DEFAULT_CAMERA.fov * Math.PI) / 360));
}

/** Runs the rig for a few seconds so its smoothing settles. */
function settle(rig: CameraRig, velocity: Vector3, frame: Vector3 | null, boss: boolean, length: number): void {
  for (let i = 0; i < 600; i++) rig.update(new Vector3(0, 0, 0), velocity, 1 / 60, frame, boss, length);
}

describe('camera rig', () => {
  it('pulls back with speed but keeps a scout at least a tenth of the screen high', () => {
    const rig = new CameraRig();
    settle(rig, new Vector3(300, 0, 0), null, false, 16);
    expect(rig.viewScale).toBeGreaterThan(1);
    expect(screenShare(rig, 16)).toBeGreaterThanOrEqual(DEFAULT_CAMERA.minShipScreen.cruise - 1e-6);
  });

  it('frames a distant fight only as far as the ship-size floor allows', () => {
    const rig = new CameraRig();
    settle(rig, new Vector3(0, 0, 0), new Vector3(900, 0, 0), false, 16);
    expect(screenShare(rig, 16)).toBeGreaterThanOrEqual(DEFAULT_CAMERA.minShipScreen.combat - 1e-6);
  });

  it('leaves the wheel zoom free', () => {
    const rig = new CameraRig();
    rig.zoomBy(3);
    settle(rig, new Vector3(0, 0, 0), null, false, 16);
    expect(rig.viewScale).toBeCloseTo(3, 6);
  });

  it('keeps the old pull-back when no ship size is given', () => {
    const rig = new CameraRig();
    settle(rig, new Vector3(1000, 0, 0), null, false, 0);
    expect(rig.viewScale).toBeCloseTo(1.9, 3);
  });
});
