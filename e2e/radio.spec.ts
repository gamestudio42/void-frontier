import { expect, test } from "@playwright/test";

type DevGame = { sim: { playerId: number; world: { events: unknown[] } } };

test("the cast speaks on the radio when something happens", async ({
  page,
}) => {
  await page.goto("/?quality=low");
  await page.getByTestId("tutorial-toggle").uncheck();
  await page.getByTestId("start").click();
  await page.getByTestId("undock").click();
  await expect(page.getByTestId("radio")).toHaveCount(0);

  // A promotion: Dispatch comes on the radio.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.world.events.push({
      type: "rank",
      rank: 1,
      id: "licensed",
      credits: 500,
    });
  });
  const radio = page.getByTestId("radio");
  await expect(radio).toHaveAttribute("data-key", "radio.rank.0");
  await expect(radio).toContainText("Dispatch");
  await expect(radio).toContainText("new rank");

  // A hired pilot remembers being saved, by name.
  await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.world.events.push({
      type: "memory",
      ship: 0,
      pilot: "Ada Ferreira",
      kind: "saved",
      sector: "outpost_alpha",
    });
  });
  await expect(radio).toHaveAttribute("data-key", "radio.memory.saved.0", {
    timeout: 15_000,
  });
  await expect(radio).toContainText("Ada Ferreira");
});
