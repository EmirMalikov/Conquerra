import { GameMode } from "@openfront/engine-api/game/GameTypes";
import { describe, expect, it } from "vitest";
import {
  firstPlace,
  myRank,
  worldLand,
} from "../../src/client/hud/layers/WorldControlPanel";
import type { GameView } from "../../src/client/view";

interface FakePlayer {
  id: string;
  tiles: number;
  alive?: boolean;
  team?: string | null;
}

function fakeGame(
  players: FakePlayer[],
  meId: string | null,
  mode: GameMode = GameMode.FFA,
): GameView {
  const views = players.map((p) => ({
    id: () => p.id,
    displayName: () => p.id,
    numTilesOwned: () => p.tiles,
    isAlive: () => p.alive ?? true,
    team: () => p.team ?? null,
    territoryColor: () => ({ toRgbString: () => "rgb(0, 0, 0)" }),
  }));
  const me = views.find((v) => v.id() === meId) ?? null;
  return {
    myPlayer: () => me,
    playerViews: () => views,
    numLandTiles: () => 1000,
    numTilesWithFallout: () => 200,
    config: () => ({ gameConfig: () => ({ gameMode: mode }) }),
  } as unknown as GameView;
}

describe("world control helpers", () => {
  it("measures the world without fallout", () => {
    expect(worldLand(fakeGame([], null))).toBe(800);
  });

  it("names the alive player with the most land in FFA", () => {
    const game = fakeGame(
      [
        { id: "a", tiles: 50 },
        { id: "b", tiles: 120 },
        { id: "dead", tiles: 500, alive: false },
      ],
      "a",
    );
    const leader = firstPlace(game, (t) => t);
    expect(leader?.name).toBe("b");
    expect(leader?.tiles).toBe(120);
    expect(leader?.isMine).toBe(false);
  });

  it("marks first place as mine when the viewer leads", () => {
    const game = fakeGame(
      [
        { id: "me", tiles: 300 },
        { id: "b", tiles: 120 },
      ],
      "me",
    );
    expect(firstPlace(game, (t) => t)?.isMine).toBe(true);
  });

  it("sums teams in team games", () => {
    const game = fakeGame(
      [
        { id: "a", tiles: 100, team: "Red" },
        { id: "b", tiles: 100, team: "Red" },
        { id: "c", tiles: 150, team: "Blue" },
      ],
      "c",
      GameMode.Team,
    );
    const leader = firstPlace(game, (t) => `team ${t}`);
    expect(leader?.name).toBe("team Red");
    expect(leader?.tiles).toBe(200);
    expect(leader?.isMine).toBe(false);
  });

  it("ranks the viewer among alive players by land", () => {
    const game = fakeGame(
      [
        { id: "a", tiles: 500 },
        { id: "me", tiles: 200 },
        { id: "b", tiles: 300 },
        { id: "c", tiles: 100 },
        { id: "dead", tiles: 900, alive: false },
      ],
      "me",
    );
    expect(myRank(game)).toBe(3);
  });

  it("has no rank for a spectator", () => {
    expect(myRank(fakeGame([{ id: "a", tiles: 5 }], null))).toBeNull();
  });
});
