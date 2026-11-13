import { expect, test } from '@playwright/test';

/**
 * Renders the mix offline (no speaker needed) through the real engine: a calm stretch,
 * then a pile-up of shots, hits, three explosions and a crash at full volume, then a
 * fight. Nothing may clip, and the score must climb into its combat stems.
 */
test('the mix survives a pile-up without clipping and the score follows the fight', async ({ page }) => {
  await page.goto('/?quality=low');
  await page.getByTestId('tutorial-toggle').uncheck();
  await page.getByTestId('start').click();
  await page.getByTestId('undock').click();
  const result = await page.evaluate(async () => {
    type Engine = { setVolumes(a: number, b: number, c: number): void; unlock(ctx: BaseAudioContext): void; handle(sim: unknown, events: unknown[]): void; update(sim: unknown, active: boolean, dt: number): void; musicLevel: number };
    const game = (window as unknown as { voidFrontier: { sim: { playerId: number; world: { bodies: Map<number, { position: { x: number; y: number } }> } }; audio: { constructor: new () => Engine } } }).voidFrontier;
    const sim = game.sim;
    const rate = 22050;
    const seconds = 10;
    const ctx = new OfflineAudioContext(2, rate * seconds, rate);
    const engine = new game.audio.constructor();
    engine.setVolumes(1, 1, 1);
    engine.unlock(ctx);
    const me = sim.world.bodies.get(sim.playerId)!.position;
    const near = (dx: number) => ({ x: me.x + dx, y: me.y });
    const storm: unknown[] = [];
    for (let i = 0; i < 40; i++) storm.push({ type: 'shot', owner: sim.playerId });
    for (let i = 0; i < 12; i++) storm.push({ type: 'hit', beam: false, target: sim.playerId, attacker: 999, point: near(5), shieldDamage: 0, hullDamage: 10 });
    for (let i = 0; i < 3; i++) storm.push({ type: 'shipDestroyed', id: 990 + i, by: sim.playerId, position: near(40 * i) });
    storm.push({ type: 'collision', a: sim.playerId, b: 5, point: near(0), normal: { x: 1, y: 0 }, speed: 30, damage: 50, losses: [{ ship: sim.playerId, shield: 20, hull: 30 }] });
    let calm = 0;
    let fight = 0;
    for (let k = 1; k < seconds * 10 - 1; k++) {
      const t = k / 10;
      void ctx.suspend(t).then(() => {
        if (k === 30) engine.handle(sim, storm);
        if (k > 30 && k % 5 === 0) engine.handle(sim, [{ type: 'shot', owner: sim.playerId }]);
        engine.update(sim, true, 0.1);
        if (k === 29) calm = engine.musicLevel;
        if (k === 90) fight = engine.musicLevel;
        void ctx.resume();
      });
    }
    const buffer = await ctx.startRendering();
    let peak = 0;
    for (let c = 0; c < 2; c++) for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    return { peak, calm, fight };
  });
  expect(result.peak).toBeLessThan(0.99);
  expect(result.peak).toBeGreaterThan(0.1);
  expect(result.calm).toBeLessThan(0.3);
  expect(result.fight).toBeGreaterThan(0.7);
});
