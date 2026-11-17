import { expect, test } from "@playwright/test";

type Point = { x: number; y: number };
type DevGame = {
  sim: {
    playerId: number;
    world: {
      bodies: Map<
        number,
        { position: Point; previousPosition: Point; velocity: Point }
      >;
      ships: Map<
        number,
        {
          faction: string;
          destroyed: boolean;
          elite?: { affixes: string[]; fearless: boolean };
        }
      >;
    };
  };
};

test("an elite pirate shows its affixes on the target panel", async ({
  page,
}) => {
  await page.goto("/?quality=low");
  await page.getByTestId("tutorial-toggle").uncheck();
  await page.getByTestId("start").click();
  await page.getByTestId("undock").click();
  await page.mouse.move(640, 200);

  // The nearest pirate, 400 m east and marked elite as a spawn roll would.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const world = game.sim.world;
    const me = world.bodies.get(game.sim.playerId)!;
    const [id, ship] = [...world.ships.entries()].find(
      ([, s]) => s.faction === "pirate" && !s.destroyed,
    )!;
    ship.elite = { affixes: ["armored", "volatile"], fearless: false };
    const body = world.bodies.get(id)!;
    body.position = { x: me.position.x + 400, y: me.position.y };
    body.previousPosition = { ...body.position };
    body.velocity = { ...me.velocity };
  });

  const elite = page.getByTestId("target-elite");
  await expect(elite).toBeVisible({ timeout: 10_000 });
  await expect(elite).toHaveAttribute("data-affixes", "armored volatile");
  await expect(elite).toContainText("Armored");
  await expect(elite).toContainText("Volatile");
  await expect(page.getByTestId("target")).toContainText("Elite");
});
