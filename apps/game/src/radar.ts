import { getResource } from '@void-frontier/content';
import { readTelemetry, type Simulation } from '@void-frontier/simulation';

const RANGE = 1400;

/**
 * North-up radar, drawn straight to a 2D canvas every frame: no React re-render.
 * Grey: rocks. Blue: station. Yellow diamonds: beacons. Centre: you.
 */
export function drawRadar(canvas: HTMLCanvasElement, sim: Simulation, time: number, target: number | null = null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth;
  if (canvas.width !== Math.round(size * ratio)) {
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const half = size / 2;
  const scale = (half - 6) / RANGE;
  ctx.clearRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, half - 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6, 12, 18, 0.78)';
  ctx.fill();
  ctx.clip();

  ctx.strokeStyle = 'rgba(111, 211, 255, 0.12)';
  ctx.lineWidth = 1;
  for (const r of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.arc(half, half, (half - 6) * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(half, 4);
  ctx.lineTo(half, size - 4);
  ctx.moveTo(4, half);
  ctx.lineTo(size - 4, half);
  ctx.stroke();

  // Cosmetic sweep.
  const sweep = (time * 1.2) % (Math.PI * 2);
  const gradient = ctx.createConicGradient(sweep - Math.PI / 2, half, half);
  gradient.addColorStop(0, 'rgba(111, 211, 255, 0.18)');
  gradient.addColorStop(0.12, 'rgba(111, 211, 255, 0)');
  gradient.addColorStop(1, 'rgba(111, 211, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const me = sim.world.bodies.get(sim.playerId);
  if (!me) {
    ctx.restore();
    return;
  }
  const toScreen = (x: number, y: number) => [half + (x - me.position.x) * scale, half - (y - me.position.y) * scale] as const;

  ctx.fillStyle = 'rgba(170, 176, 184, 0.75)';
  for (const [id, rock] of sim.world.asteroids) {
    const p = sim.world.bodies.get(id)!.position;
    const [sx, sy] = toScreen(p.x, p.y);
    if (sx < -10 || sy < -10 || sx > size + 10 || sy > size + 10) continue;
    ctx.fillStyle = sim.world.scanned.has(id) ? getResource(rock.type.resource).color : 'rgba(170, 176, 184, 0.75)';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, rock.radius * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const pickup of sim.world.pickups.values()) {
    const [sx, sy] = toScreen(pickup.position.x, pickup.position.y);
    if (sx < 0 || sy < 0 || sx > size || sy > size) continue;
    ctx.fillStyle = getResource(pickup.resource).color;
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }

  for (const [id] of sim.world.stations) {
    const body = sim.world.bodies.get(id)!;
    const collider = sim.world.colliders.get(id)!;
    const [sx, sy] = toScreen(body.position.x, body.position.y);
    ctx.strokeStyle = 'rgba(111, 211, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(sx, sy, collider.bound * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#6fd3ff';
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
  }

  // Active delivery destinations: a pulsing ring.
  for (const contract of sim.missions?.active ?? []) {
    if (!contract.delivery) continue;
    const drop = sim.missions!.drops.find((d) => d.id === contract.delivery!.drop)!;
    const [sx, sy] = toScreen(drop.position.x, drop.position.y);
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 6 + (time * 6) % 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#ffd34d';
  for (const beacon of sim.world.beacons.values()) {
    const [sx, sy] = toScreen(beacon.position.x, beacon.position.y);
    ctx.beginPath();
    ctx.moveTo(sx, sy - 4);
    ctx.lineTo(sx + 4, sy);
    ctx.lineTo(sx, sy + 4);
    ctx.lineTo(sx - 4, sy);
    ctx.closePath();
    ctx.fill();
  }

  // Other ships: hostiles in red, pointing where they face; the selected target ringed.
  for (const [id, ship] of sim.world.ships) {
    if (id === sim.playerId || ship.destroyed) continue;
    const body = sim.world.bodies.get(id)!;
    const [sx, sy] = toScreen(body.position.x, body.position.y);
    ctx.save();
    ctx.translate(sx, sy);
    if (id === target) {
      ctx.strokeStyle = '#ff5a4a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(-body.angle);
    ctx.fillStyle = ship.faction === 'pirate' ? '#ff5a4a' : '#7dffb2';
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-4, 3.5);
    ctx.lineTo(-4, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const telemetry = readTelemetry(sim.world, sim.playerId);
  if (telemetry && telemetry.speed > 0.5) {
    const v = me.velocity;
    const len = Math.min(half - 10, telemetry.speed * 4 * scale * 10);
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.lineTo(half + (v.x / telemetry.speed) * len, half - (v.y / telemetry.speed) * len);
    ctx.stroke();
  }

  ctx.translate(half, half);
  ctx.rotate(-me.angle);
  ctx.fillStyle = telemetry?.destroyed ? '#ff6b5a' : '#e8f6ff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, 4.5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-5, -4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(138, 160, 180, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(half, half, half - 2, 0, Math.PI * 2);
  ctx.stroke();
}

export const RADAR_RANGE = RANGE;
