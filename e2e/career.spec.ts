import { expect, test, type Page } from "@playwright/test";

interface DevGame {
  publish(): void;
  handInContract(id: number): void;
  sim: {
    world: {
      credits: number;
      career: {
        merit: number;
        rank: number;
        licences: string[];
        stakes: Record<string, number>;
      };
    };
    missions: {
      active: unknown[];
      offers: Record<string, { escort?: unknown }[]>;
    };
  };
}

const dev = (page: Page) =>
  page.evaluate(() =>
    Boolean((window as unknown as { voidFrontier?: DevGame }).voidFrontier),
  );

test("a finished job promotes the pilot, who then buys a licence and a stake in the station", async ({
  page,
}) => {
  await page.goto("/?quality=low");
  await page.getByTestId("tutorial-toggle").uncheck();
  await page.getByTestId("start").click();
  await expect(page.getByTestId("station")).toBeVisible();
  await expect.poll(() => dev(page)).toBe(true);

  await page.getByTestId("tab-career").click();
  await expect(page.getByTestId("rank")).toHaveAttribute("data-rank", "0");
  await expect(page.getByTestId("buy-licence-freight")).toBeDisabled();
  await expect(page.getByTestId("invest")).toBeDisabled();

  // Just short of the first rank, one finished job tips it over.
  const offers = await page.evaluate(() => {
    const game = (window as unknown as { voidFrontier: DevGame }).voidFrontier;
    game.sim.world.career.merit = 35;
    game.sim.missions.active.push({
      id: 9001,
      kind: "bounty",
      issuer: "outpost_alpha_station",
      faction: "outpost_authority",
      reward: 400,
      repGain: 1,
      duration: 900,
      deadlineTick: 1e9,
      elite: false,
      bounty: { count: 0, killsAtStart: 0 },
    });
    game.handInContract(9001);
    game.sim.world.credits = 20_000;
    game.publish();
    return game.sim.missions.offers.outpost_alpha_station.filter(
      (o) => !o.escort,
    ).length;
  });
  await expect(
    page.getByTestId("notice").filter({ hasText: /Promoted|Promovido/ }),
  ).toBeVisible();
  await expect(page.getByTestId("rank")).toHaveAttribute("data-rank", "1");
  await expect(page.getByTestId("header-rank")).toHaveText(
    /Licensed pilot|Piloto licenciado/,
  );

  await page.getByTestId("buy-licence-freight").click();
  await expect(page.getByTestId("licence-freight")).toHaveAttribute(
    "data-owned",
    "true",
  );
  // The combat licence needs a higher rank.
  await expect(page.getByTestId("buy-licence-combat")).toBeDisabled();

  await page.getByTestId("invest").click();
  await expect(page.getByTestId("stake")).toHaveAttribute("data-level", "1");
  const after = await page.evaluate(
    () =>
      (
        window as unknown as { voidFrontier: DevGame }
      ).voidFrontier.sim.missions.offers.outpost_alpha_station.filter(
        (o) => !o.escort,
      ).length,
  );
  expect(after).toBe(offers + 1);
  // Level 2 waits for the next rank.
  await expect(page.getByTestId("invest")).toBeDisabled();
});
