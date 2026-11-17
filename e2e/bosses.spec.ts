import { expect, test, type Page } from "@playwright/test";

type Point = { x: number; y: number };
interface DevGame {
  sim: {
    playerId: number;
    world: {
      gates: Map<string, { position: Point }>;
      bodies: Map<
        number,
        { position: Point; previousPosition: Point; velocity: Point }
      >;
      ships: Map<
        number,
        {
          boss?: { id: string; open: boolean };
          weapons: { overheated: boolean; heat: number }[];
        }
      >;
      bosses: { id: string; ship: number; openUntil: number }[];
      tick: number;
    };
  };
}

const move = (page: Page, to: "gate" | "boss", gateId = "") =>
  page.evaluate(
    ([to, gateId]) => {
      const game = (window as unknown as { voidFrontier: DevGame })
        .voidFrontier;
      const world = game.sim.world;
      const target =
        to === "gate"
          ? world.gates.get(gateId)!.position
          : world.bodies.get(world.bosses[0].ship)!.position;
      const at =
        to === "gate" ? { ...target } : { x: target.x + 900, y: target.y };
      const body = world.bodies.get(game.sim.playerId)!;
      body.position = at;
      body.previousPosition = { ...at };
      body.velocity = { x: 0, y: 0 };
    },
    [to, gateId] as const,
  );

test("the Industrial Belt's boss shows its bar, and its guard opens on cue", async ({
  page,
}) => {
  await page.goto("/?quality=low");
  await page.getByTestId("tutorial-toggle").uncheck();
  await page.getByTestId("start").click();
  await page.getByTestId("undock").click();
  await expect(page.getByTestId("boss")).toHaveCount(0);

  await move(page, "gate", "alpha_to_belt");
  await expect(page.getByTestId("gate")).toHaveClass(/ready/, {
    timeout: 20_000,
  });
  await page.keyboard.press("f");
  await expect(page.getByTestId("sector")).toHaveAttribute(
    "data-value",
    "industrial_belt",
  );

  await move(page, "boss");
  const bar = page.getByTestId("boss");
  await expect(bar).toHaveAttribute("data-boss", "quarry_ram", {
    timeout: 10_000,
  });
  await expect(bar).toHaveAttribute("data-open", "false");
  await expect(bar).toContainText("The Quarry Ram");
  await expect(bar).toContainText("rams one at speed");

  // What a slammed rock does, held open from outside the physics for the check.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    const world = game.sim.world;
    world.bosses[0].openUntil = world.tick + 600;
  });
  await expect(bar).toHaveAttribute("data-open", "true");
  await expect(bar).toContainText("Guard down");
});
