import { MINING_RULES, getResource } from '@void-frontier/content';
import type { Vec2 } from '@void-frontier/kernel';
import { dockingStatus, hostilesNear, readTarget, readTelemetry, type Simulation } from '@void-frontier/simulation';
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
  waypoints: { label: string; position: { x: number; y: number } }[] = [],
  markers: { label: string; position: { x: number; y: number }; colour: string }[] = [],
  stopLabel = 'Stop',
  cruise: { position: { x: number; y: number }; label: string; active: boolean; key: string } | null = null,
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

  // At a glance, around the ship itself: shield and hull as two arcs, speed beneath.
  const mine = sim.world.bodies.get(sim.playerId);
  if (mine) {
    const at = renderer.worldToScreen(mine.position, width, height);
    const radius = Math.max(58, Math.min(width, height) * 0.09);
    const arc = (from: number, to: number, share: number, colour: string, reversed: boolean) => {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(214, 221, 228, 0.14)';
      ctx.beginPath();
      ctx.arc(at.x, at.y, radius, from, to);
      ctx.stroke();
      if (share <= 0) return;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      if (reversed) ctx.arc(at.x, at.y, radius, to - (to - from) * share, to);
      else ctx.arc(at.x, at.y, radius, from, from + (to - from) * share);
      ctx.stroke();
    };
    const hullShare = me.hull / me.definition.hull.integrity;
    arc(Math.PI * 0.72, Math.PI * 1.28, me.shield / Math.max(1, me.definition.shield.capacity), '#6fd3ff', true);
    arc(-Math.PI * 0.28, Math.PI * 0.28, hullShare, hullShare < 0.35 ? '#ff6b5a' : hullShare < 0.7 ? '#ffb347' : '#7dffb2', true);
    ctx.textAlign = 'center';
    ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(214, 221, 228, 0.9)';
    ctx.fillText(`${Math.round(Math.hypot(mine.velocity.x, mine.velocity.y))} m/s`, at.x, at.y + radius + 18);
  }

  // Where the brake would stop the ship: the world ring shows it on screen; off screen,
  // a red chevron on the edge keeps it in mind at speed.
  if (mine) {
    const speed = Math.hypot(mine.velocity.x, mine.velocity.y);
    const stopping = speed > 5 ? (readTelemetry(sim.world, sim.playerId)?.stoppingDistance ?? 0) : 0;
    if (stopping > 0) {
      const stop = { x: mine.position.x + (mine.velocity.x / speed) * stopping, y: mine.position.y + (mine.velocity.y / speed) * stopping };
      const s = renderer.worldToScreen(stop, width, height);
      if (!s.onScreen) {
        const label = `${stopLabel} ${stopping >= 1000 ? `${(stopping / 1000).toFixed(2)} km` : `${Math.round(stopping)} m`}`;
        drawEdgeChevron(ctx, s, width, height, '#ff6b5a', label);
      }
    }
  }

  // Where the ship will be over the next five seconds if nothing changes: a dot a second.
  if (mine) {
    const speed = Math.hypot(mine.velocity.x, mine.velocity.y);
    if (speed > 5) {
      ctx.fillStyle = '#d6dde4';
      for (let second = 1; second <= 5; second++) {
        const s = renderer.worldToScreen({ x: mine.position.x + mine.velocity.x * second, y: mine.position.y + mine.velocity.y * second }, width, height);
        if (!s.onScreen) break;
        ctx.globalAlpha = 0.55 - second * 0.08;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Cruise: a dashed course to the destination while it flies; before that, a tag on
  // what the cruise key would pick under the cursor.
  if (mine && cruise) {
    const s = renderer.worldToScreen(cruise.position, width, height);
    const here = renderer.worldToScreen(mine.position, width, height);
    const colour = '#6fd3ff';
    const distance = Math.hypot(cruise.position.x - mine.position.x, cruise.position.y - mine.position.y);
    const label = `${cruise.active ? '⟫' : `${cruise.key} ⟫`} ${cruise.label} · ${distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`}`;
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    if (cruise.active) {
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 10]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(here.x, here.y);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (s.onScreen) {
      ctx.lineWidth = cruise.active ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(label, s.x, s.y + 30);
    } else {
      drawEdgeChevron(ctx, s, width, height, colour, label);
    }
  }

  // Gates and signals: a label when on screen only, so they never crowd the edges.
  ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  for (const marker of markers) {
    const s = renderer.worldToScreen(marker.position, width, height);
    if (!s.onScreen) continue;
    ctx.fillStyle = marker.colour;
    ctx.fillText(marker.label, s.x, s.y - 62);
  }

  // Contract waypoints: a diamond on screen, an edge chevron when off screen.
  for (const waypoint of waypoints) {
    const s = renderer.worldToScreen(waypoint.position, width, height);
    const myPos = sim.world.bodies.get(sim.playerId)!.position;
    const distance = Math.hypot(waypoint.position.x - myPos.x, waypoint.position.y - myPos.y);
    const label = `${waypoint.label} · ${distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`}`;
    ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#ffd27a';
    ctx.strokeStyle = '#ffd27a';
    if (s.onScreen) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 11);
      ctx.lineTo(s.x + 11, s.y);
      ctx.lineTo(s.x, s.y + 11);
      ctx.lineTo(s.x - 11, s.y);
      ctx.closePath();
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(label, s.x, s.y - 18);
    } else {
      drawEdgeChevron(ctx, s, width, height, '#ffd27a', label);
    }
  }

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
    const d = Math.hypot(body.position.x - myBody.position.x, body.position.y - myBody.position.y);
    // Close by, the scan shows the rich vein: a bright arc on the side to cut from.
    if (d < VEIN_SHOW_RANGE) drawVein(ctx, renderer, width, height, body, rock, getResource(rock.type.resource).color);
    // Label only rocks worth flying to: close ones, or big ones further out.
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

  // The rock under the player's mining laser: a ring that fills with its heat.
  const cutting = me.weapons.find((w) => w.definition.kind === 'mining')?.beam?.hit;
  const hot = cutting !== null && cutting !== undefined ? sim.world.asteroids.get(cutting) : undefined;
  const hotBody = hot ? sim.world.bodies.get(cutting!) : undefined;
  if (hot && hotBody) drawHeatRing(ctx, renderer, width, height, hotBody.position, hot.radius, hot.stress);

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

/** An off-screen point as a chevron on an ellipse around the screen centre, with its label inside it. */
function drawEdgeChevron(
  ctx: CanvasRenderingContext2D,
  s: { x: number; y: number; behind: boolean },
  width: number,
  height: number,
  colour: string,
  label: string,
): void {
  const cx = width / 2;
  const cy = height / 2;
  let dx = s.x - cx;
  let dy = s.y - cy;
  if (s.behind) {
    dx = -dx;
    dy = -dy;
  }
  const angle = Math.atan2(dy, dx);
  // On an ellipse around the ship, inside the corners where the HUD panels sit.
  const ax = cx + Math.cos(angle) * Math.max(140, cx - 260);
  const ay = cy + Math.sin(angle) * Math.max(110, cy - 130);
  ctx.font = '600 11px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = colour;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(0, -8);
  ctx.lineTo(0, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillText(label, ax - Math.cos(angle) * 52, ay - Math.sin(angle) * 34 + 4);
}

/** Metres within which a scanned rock shows its vein. */
const VEIN_SHOW_RANGE = 450;

/** The arc of a rock's rim that lies on its vein, projected onto the screen. */
function drawVein(ctx: CanvasRenderingContext2D, renderer: SpaceRenderer, width: number, height: number, body: { position: Vec2; angle: number }, rock: { radius: number; vein: number }, color: string): void {
  const half = (MINING_RULES.veinWidth * Math.PI) / 180;
  const centre = body.angle + rock.vein;
  const rim = rock.radius * 1.08;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = centre - half + (i / 8) * half * 2;
    const p = renderer.worldToScreen({ x: body.position.x + Math.cos(a) * rim, y: body.position.y + Math.sin(a) * rim }, width, height);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** A ring around the rock being cut, filled clockwise with its heat; the sweet spot is marked. */
function drawHeatRing(ctx: CanvasRenderingContext2D, renderer: SpaceRenderer, width: number, height: number, position: Vec2, radius: number, stress: number): void {
  const c = renderer.worldToScreen(position, width, height);
  if (!c.onScreen) return;
  const edge = renderer.worldToScreen({ x: position.x + radius, y: position.y }, width, height);
  const r = Math.max(14, Math.abs(edge.x - c.x) + 10);
  const [low, high] = MINING_RULES.sweetSpot;
  const at = (share: number) => -Math.PI / 2 + Math.min(1, share / MINING_RULES.fractureAt) * Math.PI * 2;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(125, 255, 178, 0.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, at(low), at(high));
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = stress < low ? '#6fd3ff' : stress <= high ? '#7dffb2' : '#ff6b5a';
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, at(0), at(stress));
  ctx.stroke();
  ctx.restore();
}
