import { getResource } from '@void-frontier/content';
import { dockingStatus, hostilesNear, readTarget, type Simulation } from '@void-frontier/simulation';
import type { SpaceRenderer } from '@void-frontier/view3d';

/**
 * Screen-space combat markers drawn on a 2D canvas over the scene every frame:
 * brackets on hostiles, the selected target's lead marker and an edge arrow when it
 * is off screen, plus a hit marker when your rounds connect.
 */
export function drawTargeting(
  canvas: HTMLCanvasElement,
  sim: Simulation,
  renderer: SpaceRenderer,
  target: number | null,
  hitFlash: number,
  pointer: { x: number; y: number } | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const me = sim.world.ships.get(sim.playerId);
  if (!me || me.destroyed || me.docked !== null) return;

  // Docking guide: approach corridor out of the bay and the target ring inside it.
  const dock = dockingStatus(sim.world, sim.playerId, 400);
  if (dock) {
    const { bay } = dock;
    const ready = dock.refusals.length === 0;
    const colour = ready ? '#7dffb2' : '#6fd3ff';
    const mouth = renderer.worldToScreen(bay.mouth, width, height);
    const far = renderer.worldToScreen({ x: bay.mouth.x + bay.axis.x * 220, y: bay.mouth.y + bay.axis.y * 220 }, width, height);
    const centre = renderer.worldToScreen(bay.centre, width, height);
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(mouth.x, mouth.y);
    ctx.lineTo(centre.x, centre.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Ring sized to the allowed docking distance.
    const edge = renderer.worldToScreen({ x: bay.centre.x + dock.limits.maxDistance, y: bay.centre.y }, width, height);
    const radius = Math.max(6, Math.hypot(edge.x - centre.x, edge.y - centre.y));
    ctx.lineWidth = ready ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Scanner readings: composition tags on revealed rocks that are on screen.
  ctx.font = '600 10.5px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'left';
  const myBody = sim.world.bodies.get(sim.playerId)!;
  for (const id of sim.world.scanned.keys()) {
    const rock = sim.world.asteroids.get(id);
    const body = sim.world.bodies.get(id);
    if (!rock || !body) continue;
    // Label only rocks worth flying to: close ones, or big ones further out.
    const d = Math.hypot(body.position.x - myBody.position.x, body.position.y - myBody.position.y);
    if (d > 350 && rock.ore < 150) continue;
    const s = renderer.worldToScreen(body.position, width, height);
    if (!s.onScreen) continue;
    const color = getResource(rock.type.resource).color;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x + 3, s.y - 3);
    ctx.lineTo(s.x + 12, s.y - 12);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(`${RESOURCE_TAGS[rock.type.resource] ?? '?'} ${Math.ceil(rock.ore)}`, s.x + 14, s.y - 13);
    ctx.globalAlpha = 1;
  }

  for (const id of hostilesNear(sim.world, sim.playerId, me.definition.sensors.range)) {
    const body = sim.world.bodies.get(id)!;
    const s = renderer.worldToScreen(body.position, width, height);
    if (!s.onScreen) continue;
    const size = id === target ? 26 : 16;
    ctx.strokeStyle = id === target ? '#ff5a4a' : 'rgba(255, 90, 74, 0.55)';
    ctx.lineWidth = id === target ? 2 : 1.25;
    brackets(ctx, s.x, s.y, size);
  }

  const info = readTarget(sim.world, sim.playerId, target);
  if (!info) return;
  const s = renderer.worldToScreen(info.position, width, height);
  if (s.onScreen) {
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#ffb3a8';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(info.distance)} m`, s.x, s.y + 42);
    bar(ctx, s.x - 24, s.y + 30, 48, info.shield / Math.max(1, info.shieldMax), '#6fd3ff');
    bar(ctx, s.x - 24, s.y + 35, 48, info.hull / info.hullMax, '#7dffb2');
    if (info.lead) {
      const l = renderer.worldToScreen(info.lead, width, height);
      if (!l.behind) {
        ctx.strokeStyle = 'rgba(255, 211, 77, 0.45)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(l.x, l.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ffd34d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y - 7);
        ctx.lineTo(l.x + 7, l.y);
        ctx.lineTo(l.x, l.y + 7);
        ctx.lineTo(l.x - 7, l.y);
        ctx.closePath();
        ctx.stroke();
      }
    }
  } else {
    // Edge arrow toward an off-screen target.
    const cx = width / 2;
    const cy = height / 2;
    let dx = s.x - cx;
    let dy = s.y - cy;
    if (s.behind) {
      dx = -dx;
      dy = -dy;
    }
    const angle = Math.atan2(dy, dx);
    const margin = 40;
    const scale = Math.min((cx - margin) / Math.abs(Math.cos(angle) || 1e-6), (cy - margin) / Math.abs(Math.sin(angle) || 1e-6));
    const ax = cx + Math.cos(angle) * scale;
    const ay = cy + Math.sin(angle) * scale;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = '#ff5a4a';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-6, -9);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#ffb3a8';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(info.distance)} m`, ax - Math.cos(angle) * 26, ay - Math.sin(angle) * 26 + 4);
  }

  if (hitFlash > 0 && pointer) {
    const px = (pointer.x * 0.5 + 0.5) * width;
    const py = (-pointer.y * 0.5 + 0.5) * height;
    ctx.strokeStyle = `rgba(255, 255, 255, ${hitFlash})`;
    ctx.lineWidth = 2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(px + sx * 6, py + sy * 6);
      ctx.lineTo(px + sx * 12, py + sy * 12);
      ctx.stroke();
    }
  }
}

/** Chemical-symbol style tags keep scan labels short and language-neutral. */
const RESOURCE_TAGS: Record<string, string> = { iron_ore: 'Fe', copper_ore: 'Cu', titanium_ore: 'Ti', salvage: 'Sv' };

function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const k = size * 0.4;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * size, y + sy * (size - k));
    ctx.lineTo(x + sx * size, y + sy * size);
    ctx.lineTo(x + sx * (size - k), y + sy * size);
    ctx.stroke();
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, ratio: number, color: string): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x, y, width, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), 3);
}
