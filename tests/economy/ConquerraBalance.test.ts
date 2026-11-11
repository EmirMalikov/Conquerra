import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { TROOP_GROWTH_MULTIPLIER } from "@openfront/engine-lib/configuration/Config";
import { pow } from "@openfront/engine-lib/DetMath";
import {
  ATOM_BOMB_COST,
  BASE_GOLD_PER_TICK,
  BOT_GOLD_PER_TICK,
  DEFENSE_POST_COST_STEP,
  ECONOMY_BUILDING_BASE_COST,
  MISSILE_SILO_COST,
} from "@openfront/engine/configuration/EngineConfig";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import { setup } from "../util/Setup";

// Conquerra's balance changes, pinned to the numbers in the fork's
// "before -> after" table so a later edit to one of them is deliberate.
describe("Conquerra balance", () => {
  let game: Game;
  let human: Player;
  let bot: Player;

  const humanInfo = new PlayerInfo("human", PlayerType.Human, null, "h_id");
  const botInfo = new PlayerInfo("bot", PlayerType.Bot, null, "b_id");

  beforeEach(async () => {
    game = await setup(
      "plains",
      { infiniteGold: false, instantBuild: false, infiniteTroops: false },
      [humanInfo, botInfo],
    );
    human = game.player(humanInfo.id);
    bot = game.player(botInfo.id);
    human.conquer(game.ref(0, 10));
    bot.conquer(game.ref(15, 15));
  });

  test("the constants are the agreed values", () => {
    expect(ECONOMY_BUILDING_BASE_COST).toBe(100_000);
    expect(DEFENSE_POST_COST_STEP).toBe(40_000);
    expect(MISSILE_SILO_COST).toBe(800_000);
    expect(ATOM_BOMB_COST).toBe(600_000);
    expect(BASE_GOLD_PER_TICK).toBe(130n);
    expect(BOT_GOLD_PER_TICK).toBe(65n);
    expect(TROOP_GROWTH_MULTIPLIER).toBe(1.15);
  });

  test("first structures and nukes cost the new prices", () => {
    const cost = (type: UnitType) => game.unitInfo(type).cost(game, human);
    expect(cost(UnitType.City)).toBe(100_000n);
    expect(cost(UnitType.Port)).toBe(100_000n);
    expect(cost(UnitType.Factory)).toBe(100_000n);
    expect(cost(UnitType.DefensePost)).toBe(40_000n);
    expect(cost(UnitType.MissileSilo)).toBe(800_000n);
    expect(cost(UnitType.AtomBomb)).toBe(600_000n);
    // Unchanged from upstream.
    expect(cost(UnitType.SAMLauncher)).toBe(1_500_000n);
    expect(cost(UnitType.Warship)).toBe(250_000n);
    expect(cost(UnitType.HydrogenBomb)).toBe(5_000_000n);
  });

  test("each city doubles the next one's price", () => {
    human.addGold(10_000_000n);
    game.addExecution(
      new ConstructionExecution(human, UnitType.City, game.ref(0, 10)),
    );
    game.executeNextTick();
    game.executeNextTick();
    expect(game.unitInfo(UnitType.City).cost(game, human)).toBe(200_000n);
  });

  test("passive gold income per tick", () => {
    expect(game.config().goldAdditionRate(human)).toBe(130n);
    expect(game.config().goldAdditionRate(bot)).toBe(65n);
  });

  test("troops regrow 15% faster than the upstream formula", () => {
    const troops = human.troops();
    const max = game.config().maxTroops(human);
    const upstream =
      Math.min(
        troops + (10 + pow(troops, 0.73) / 4) * (1 - troops / max),
        max,
      ) - troops;
    const ours = game.config().troopIncreaseRate(human);
    expect(troops).toBeLessThan(max);
    expect(ours).toBeCloseTo(upstream * 1.15, 6);
  });
});
