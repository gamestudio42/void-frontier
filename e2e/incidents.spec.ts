import { expect, test, type Page } from "@playwright/test";

type Point = { x: number; y: number };
type Body = { position: Point; previousPosition: Point; velocity: Point };
type DevGame = {
  sim: {
    playerId: number;
    startIncident(kind: string): { position: Point; trap: boolean } | null;
    holdHostiles(held: boolean): void;
    world: {
      credits: number;
      bodies: Map<number, Body>;
      ships: Map<number, { shield: number }>;
      director: { incident: { kind: string; endTick: number } | null };
      tick: number;
    };
  };
};

/** Out of the bay, into open space with the sector's pirates held off. */
async function launch(page: Page) {
  await page.goto("/?quality=low");
  await page.getByTestId("tutorial-toggle").uncheck();
  await page.getByTestId("start").click();
  await page.getByTestId("undock").click();
  await page.mouse.move(640, 200);
  await expect(page.getByTestId("incident")).toHaveCount(0);
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.holdHostiles(true);
    const me = game.sim.world.bodies.get(game.sim.playerId)!;
    me.position = { x: 3000, y: 3000 };
    me.previousPosition = { ...me.position };
    me.velocity = { x: 0, y: 0 };
  });
}

test("a distress call shows on the HUD and pays the pilot who answers it", async ({
  page,
}) => {
  await launch(page);
  const at = await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    return game.sim.startIncident("distress")!.position;
  });
  const panel = page.getByTestId("incident");
  await expect(panel).toHaveAttribute("data-kind", "distress");
  await expect(panel).toContainText("Distress call");
  await expect(panel).toContainText("SOS marker");
  await expect(panel).toContainText("km");

  const credits = await page.evaluate((at) => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const me = game.sim.world.bodies.get(game.sim.playerId)!;
    me.position = { ...at };
    me.previousPosition = { ...at };
    return game.sim.world.credits;
  }, at);
  await expect(panel).toHaveCount(0);
  await expect(page.getByText("Survivors rescued")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { voidFrontier: DevGame }).voidFrontier.sim.world
          .credits,
    ),
  ).toBeGreaterThan(credits);
});

test("a solar flare is announced, then says whether the ship is in cover", async ({
  page,
}) => {
  await launch(page);
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.startIncident("solarFlare");
  });
  const panel = page.getByTestId("incident");
  await expect(panel).toHaveAttribute("data-stage", "warning");
  await expect(panel).toContainText("Flare incoming");
  // Skip the warning: the flare burns, and out here there is nothing to hide behind.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.world.director.incident!.endTick = game.sim.world.tick;
  });
  await expect(panel).toHaveAttribute("data-stage", "active");
  await expect(panel).toContainText("Exposed");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as { voidFrontier: DevGame })
          .voidFrontier;
        return game.sim.world.ships.get(game.sim.playerId)!.shield;
      }),
    )
    .toBe(0);
});
