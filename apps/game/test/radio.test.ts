import { describe, expect, it } from "vitest";
import { OUTPOST_ALPHA } from "@void-frontier/content";
import { Simulation, type SimEvent } from "@void-frontier/simulation";
import { Radio } from "../src/radio.ts";
import { en } from "../src/locales/en.ts";

function sim() {
  const s = Simulation.fromSector(OUTPOST_ALPHA);
  s.holdHostiles(true);
  return s;
}

describe("radio", () => {
  it("says nothing at the start, then greets the player in a new sector", () => {
    const s = sim();
    const radio = new Radio();
    radio.handle(s, [], 0);
    expect(radio.line(0)).toBeNull();
    s.world.sectorId = "industrial_belt";
    radio.handle(s, [], 1);
    const line = radio.line(10);
    expect(line).toMatchObject({
      speaker: "foreman",
      key: "radio.arrive.industrial_belt.0",
    });
    expect(en[line!.key as keyof typeof en]).toBeTruthy();
  });

  it("plays one line at a time, spaced out, and does not repeat a trigger within its cooldown", () => {
    const s = sim();
    const radio = new Radio();
    radio.handle(s, [], 0);
    const promoted: SimEvent = {
      type: "rank",
      rank: 1,
      id: "licensed",
      credits: 500,
    };
    radio.handle(s, [promoted, { type: "cargoFull", ship: s.playerId }], 5);
    expect(radio.line(5)?.key).toBe("radio.rank.0");
    expect(radio.line(7)?.key).toBe("radio.rank.0");
    expect(radio.line(11)?.key).toBe("radio.holdFull.0");
    radio.handle(s, [promoted], 20);
    expect(radio.line(30)).toBeNull();
    radio.handle(s, [promoted], 60);
    expect(radio.line(60)?.key).toBe("radio.rank.1");
  });

  it("lets a hired pilot speak by name about what they remember", () => {
    const s = sim();
    const radio = new Radio();
    radio.handle(s, [], 0);
    radio.handle(
      s,
      [
        {
          type: "memory",
          ship: 9,
          pilot: "Ada Ferreira",
          kind: "saved",
          sector: "outpost_alpha",
        },
      ],
      5,
    );
    expect(radio.line(5)).toMatchObject({
      speaker: "wing",
      name: "Ada Ferreira",
      key: "radio.memory.saved.0",
    });
  });

  it("every line it can play exists in the string table", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("radio."));
    for (const trigger of [
      "hull",
      "contact",
      "elite",
      "ambush",
      "open",
      "bossDown",
      "holdFull",
      "rank",
      "memory.saved",
      "memory.boss",
      "memory.elite",
      "recall.saved",
      "recall.boss",
      "recall.elite",
    ]) {
      for (let i = 0; i < 3; i++)
        expect(keys).toContain(`radio.${trigger}.${i}`);
    }
  });
});
