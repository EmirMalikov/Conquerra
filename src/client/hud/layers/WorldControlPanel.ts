import {
  ColoredTeams,
  GameMode,
  Team,
} from "@openfront/engine-api/game/GameTypes";
import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import { translateText } from "../../Utils";
import { GameView, PlayerView } from "../../view";

/** The land a share of the world is measured against: fallout doesn't count. */
export function worldLand(game: GameView): number {
  return game.numLandTiles() - game.numTilesWithFallout();
}

export interface FirstPlace {
  name: string;
  tiles: number;
  isMine: boolean;
  /** CSS colour for the swatch next to the leader's name. */
  color: string | null;
}

/**
 * The side closest to winning, judged the way WinCheckExecution judges it:
 * the top alive player in FFA, the top team by combined alive tiles
 * otherwise. Null while the bot team leads (it can't win, and the runner-up
 * crossing the bar wouldn't end the game) or when nobody is alive.
 */
export function firstPlace(
  game: GameView,
  teamName: (team: Team) => string,
): FirstPlace | null {
  const me = game.myPlayer();
  const alive = game.playerViews().filter((p) => p.isAlive());
  if (game.config().gameConfig().gameMode === GameMode.FFA) {
    let top: PlayerView | null = null;
    for (const p of alive) {
      if (top === null || p.numTilesOwned() > top.numTilesOwned()) top = p;
    }
    return top !== null
      ? {
          name: top.displayName(),
          tiles: top.numTilesOwned(),
          isMine: me !== null && top.id() === me.id(),
          color: top.territoryColor().toRgbString(),
        }
      : null;
  }
  const teamTiles = new Map<Team, number>();
  for (const p of alive) {
    const team = p.team();
    if (team === null) continue;
    teamTiles.set(team, (teamTiles.get(team) ?? 0) + p.numTilesOwned());
  }
  let topTeam: [Team, number] | null = null;
  for (const entry of teamTiles) {
    if (topTeam === null || entry[1] > topTeam[1]) topTeam = entry;
  }
  if (topTeam === null || topTeam[0] === ColoredTeams.Bot) return null;
  return {
    name: teamName(topTeam[0]),
    tiles: topTeam[1],
    isMine: me !== null && me.team() === topTeam[0],
    color: null,
  };
}

/** The viewer's place among alive players by land held, 1-based. */
export function myRank(game: GameView): number | null {
  const me = game.myPlayer();
  if (me === null || !me.isAlive()) return null;
  const mine = me.numTilesOwned();
  let rank = 1;
  for (const p of game.playerViews()) {
    if (p.isAlive() && p.id() !== me.id() && p.numTilesOwned() > mine) rank++;
  }
  return rank;
}

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

function teamDisplayName(team: Team): string {
  const key = `team_colors.${team.toLowerCase()}`;
  const translated = translateText(key);
  return translated !== key ? translated : team;
}

/**
 * Top-centre HUD card: the match clock (or the spawn protection countdown)
 * and the "World control" bar: first place's share of the world against the
 * share needed to win, with a tick at the goal.
 */
@customElement("world-control-panel")
export class WorldControlPanel extends LitElement implements Controller {
  public game: GameView;

  @state() private visible = false;
  @state() private clockLabel = "";
  @state() private clock = "";
  @state() private isProtected = false;
  @state() private goalPct = 80;
  @state() private leader: FirstPlace | null = null;
  @state() private leaderPct = 0;

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    if (!this.game) return;
    // The spawn phase has its own timer and nobody holds land yet.
    if (this.game.inSpawnPhase() || this.game.gameOver()) {
      this.visible = false;
      return;
    }
    this.visible = true;
    const config = this.game.config();
    const elapsed = this.game.elapsedGameSeconds();

    const protectedLeft =
      (config.spawnImmunityDuration() - this.game.ticksSinceStart()) / 10;
    const maxMinutes = config.gameConfig().maxTimerValue;
    if (this.game.isSpawnImmunityActive() && protectedLeft > 0) {
      this.isProtected = true;
      this.clockLabel = translateText("hud.protected");
      this.clock = mmss(protectedLeft);
    } else if (maxMinutes !== undefined && maxMinutes !== null) {
      this.isProtected = false;
      this.clockLabel = translateText("hud.time_left");
      this.clock = mmss(maxMinutes * 60 - elapsed);
    } else {
      this.isProtected = false;
      this.clockLabel = translateText("hud.match_time");
      this.clock = mmss(elapsed);
    }

    this.goalPct = config.percentageTilesOwnedToWin(elapsed);
    const land = worldLand(this.game);
    this.leader = firstPlace(this.game, teamDisplayName);
    this.leaderPct =
      land > 0 && this.leader !== null ? (this.leader.tiles / land) * 100 : 0;
  }

  render() {
    if (!this.visible) return nothing;
    const leaderLine =
      this.leader === null
        ? ""
        : this.leader.isMine
          ? translateText("hud.you_lead", {
              percent: this.leaderPct.toFixed(2),
            })
          : translateText("hud.leads", {
              name: this.leader.name,
              percent: this.leaderPct.toFixed(2),
            });
    return html`
      <div
        class="tc-panel pointer-events-auto flex items-stretch gap-4 px-4 py-2.5 text-white"
        translate="no"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <div class="flex min-w-[5.5rem] flex-col justify-center">
          <span
            class="tc-label text-[0.68rem] ${
              this.isProtected ? "text-[var(--tc-green)]" : "text-white/60"
            }"
            >${this.clockLabel}</span
          >
          <span
            class="font-display text-2xl font-bold leading-tight tabular-nums ${
              this.isProtected ? "text-[var(--tc-green)]" : ""
            }"
            >${this.clock}</span
          >
        </div>
        <div class="w-px self-stretch bg-white/10"></div>
        <div class="flex w-[min(24rem,52vw)] flex-col justify-center gap-1">
          <div class="flex items-center justify-between">
            <span class="tc-label text-[0.68rem] text-white/60"
              >${translateText("hud.world_control")}</span
            >
            <span class="tc-label text-[0.68rem] text-[var(--tc-accent)]"
              >${translateText("hud.goal", { percent: this.goalPct })}</span
            >
          </div>
          <div class="relative h-2 rounded-full bg-white/10">
            <div
              class="absolute inset-y-0 left-0 rounded-full ${
                this.leader !== null && !this.leader.isMine
                  ? "bg-red-400"
                  : "bg-[#8f7bff]"
              }"
              style="width:${Math.min(100, this.leaderPct)}%"
            ></div>
            <div
              class="absolute -top-1 -bottom-1 w-0.5 rounded bg-[var(--tc-accent)]"
              style="left:${Math.min(100, this.goalPct)}%"
            ></div>
          </div>
          <div class="flex items-center gap-1.5 text-xs font-semibold">
            ${
              this.leader !== null
                ? html`<span
                    class="size-2.5 rounded-[3px]"
                    style="background:${this.leader.color ?? "#8f7bff"}"
                  ></span>`
                : nothing
            }
            <span class="truncate">${leaderLine}</span>
          </div>
        </div>
      </div>
    `;
  }
}

/** Top-right pill: the viewer's place and their share of the world. */
@customElement("world-rank-pill")
export class WorldRankPill extends LitElement implements Controller {
  public game: GameView;

  @state() private rank: number | null = null;
  @state() private sharePct = 0;

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    if (!this.game || this.game.inSpawnPhase()) {
      this.rank = null;
      return;
    }
    const me = this.game.myPlayer();
    this.rank = myRank(this.game);
    const land = worldLand(this.game);
    this.sharePct =
      me !== null && land > 0 ? (me.numTilesOwned() / land) * 100 : 0;
  }

  render() {
    if (this.rank === null) return nothing;
    return html`
      <div
        class="tc-panel pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 font-display text-base font-bold text-white"
        translate="no"
      >
        <svg
          viewBox="0 0 20 20"
          class="size-4 text-white/70"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2 17h4V9H2v8Zm6 0h4V3H8v14Zm6 0h4v-6h-4v6Z" />
        </svg>
        ${translateText("hud.rank", {
          rank: this.rank,
          percent: this.sharePct.toFixed(2),
        })}
      </div>
    `;
  }
}
