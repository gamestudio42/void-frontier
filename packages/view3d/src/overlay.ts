import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, RingGeometry, type Vector3 } from 'three';
import { PALETTE } from './palette.ts';

const OVERLAY_HEIGHT = 0.5;

function segment(color: number, opacity: number): Line {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  const line = new Line(geometry, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  line.frustumCulled = false;
  line.renderOrder = 5;
  return line;
}

function setSegment(line: Line, from: Vector3, dx: number, dz: number): void {
  const attribute = line.geometry.getAttribute('position') as BufferAttribute;
  attribute.setXYZ(0, from.x, OVERLAY_HEIGHT, from.z);
  attribute.setXYZ(1, from.x + dx, OVERLAY_HEIGHT, from.z + dz);
  attribute.needsUpdate = true;
}

function ring(inner: number, outer: number, color: number, opacity: number): Mesh {
  const mesh = new Mesh(
    new RingGeometry(inner, outer, 40),
    new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 5;
  return mesh;
}

/**
 * Flight instruments drawn in the world: where the nose points, where the ship is going,
 * where the brake would stop it and where the mouse is steering. Separating heading
 * from velocity is the core readability rule of Newtonian flight.
 */
export class FlightOverlay {
  readonly root = new Group();
  private readonly heading = segment(PALETTE.heading, 0.75);
  private readonly velocity = segment(PALETTE.velocity, 0.9);
  private readonly stop = ring(3.2, 4.2, PALETTE.stopMarker, 0.8);
  private readonly aim = ring(2.4, 3, PALETTE.heading, 0.55);

  constructor() {
    this.root.add(this.heading, this.velocity, this.stop, this.aim);
  }

  update(input: {
    position: Vector3;
    /** unit forward on the XZ plane */
    forward: { x: number; z: number };
    velocity: Vector3;
    stoppingDistance: number;
    shipLength: number;
    aim: Vector3 | null;
    scale: number;
  }): void {
    const { position, forward, velocity, scale } = input;
    const headingLength = input.shipLength * 0.6 + 30 * scale;
    setSegment(this.heading, position, forward.x * headingLength, forward.z * headingLength);

    const speed = Math.hypot(velocity.x, velocity.z);
    this.velocity.visible = speed > 0.5;
    this.stop.visible = speed > 0.5 && input.stoppingDistance > input.shipLength;
    if (speed > 0.5) {
      const shown = Math.min(speed * 2, 400);
      setSegment(this.velocity, position, (velocity.x / speed) * shown, (velocity.z / speed) * shown);
      this.stop.position.set(
        position.x + (velocity.x / speed) * input.stoppingDistance,
        OVERLAY_HEIGHT,
        position.z + (velocity.z / speed) * input.stoppingDistance,
      );
      this.stop.scale.setScalar(scale);
    }

    this.aim.visible = input.aim !== null;
    if (input.aim) {
      this.aim.position.set(input.aim.x, OVERLAY_HEIGHT, input.aim.z);
      this.aim.scale.setScalar(scale);
    }
  }
}
