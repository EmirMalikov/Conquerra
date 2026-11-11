import { TileRef } from "@openfront/engine-api/game/GameMap";
import { GameMode, GameType, Gold } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { ClientID } from "@openfront/engine-api/Schemas";
import { Config } from "@openfront/engine-lib/configuration/Config";
import { renderNumber, renderTroops } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { EventBus } from "@openfront/shared/EventBus";
import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import { Controller } from "../../Controller";
import { AttackRatioEvent, isForwardedClick } from "../../InputHandler";
import { UIState } from "../../UIState";
import { USER_SETTINGS_CHANGED_EVENT, UserSettings } from "../../UserSettings";
import { getGamesPlayed, translateText } from "../../Utils";
import { GameView } from "../../view";
import { PlayerView } from "../../view/PlayerView";
import { goldCoinIcon, soldierIcon } from "../HotbarIcons";
import { OnboardingLowTroopsEvent } from "../Onboarding";
import { TutorialHighlight, TutorialHighlightEvent } from "../Tutorial";
const swordIcon = assetUrl("images/SwordIcon.svg");

/** The attack-share chips in the HUD (the slider/wheel still allow 1-100%). */
const ATTACK_PRESETS = [0.1, 0.25, 0.35, 0.5, 0.75] as const;

@customElement("control-panel")
export class ControlPanel extends LitElement implements Controller {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public uiState: UIState;

  @state()
  private attackRatio: number = 0.2;

  @state()
  private _maxTroops: number;

  @state()
  private troopRate: number;

  @state()
  private _troops: number;

  @state()
  private _isVisible = false;

  @state()
  private _notification: { type: "warning" | "info"; message: string } | null =
    null;

  @state()
  private _gold: Gold;

  @state()
  private _attackingTroops: number = 0;

  /** Smoothed passive gold income, per second (see trackGoldRate). */
  @state()
  private _goldRate = 0;
  private _prevGold: Gold | null = null;
  /** The player's share of the world's land (fallout excluded), percent. */
  @state()
  private _worldShare = 0;

  @state()
  private _goldGain: bigint | null = null;
  @state()
  private _goldGainPulseId: number = 0;
  private _goldGainTimeoutId: ReturnType<typeof setTimeout> | null = null;

  @state()
  private _tutorialHighlight: TutorialHighlight | null = null;
  /** The onboarding tutorial's low-troops warning is up: flash the bar. */
  @state()
  private _lowTroopsAlert = false;

  private _troopRateIsIncreasing: boolean = true;

  private _lastTroopIncreaseRate: number;

  // Border detection cache
  private _nearbyPlayerIDs: Set<number> = new Set();
  private _borderRefreshCounter: number = 0;
  private _borderTilesPromise: Promise<void> | null = null;
  // Track last attack tick per target player (for 15-second threshold)
  private _lastAttackTickByTarget: Map<number, number> = new Map();
  private static readonly BORDER_REFRESH_INTERVAL = 10; // recompute every 1s
  private static readonly ATTACK_THRESHOLD_TICKS = 15 * 10; // 15 seconds

  connectedCallback() {
    super.connectedCallback();
    // The attack ratio is cached below for the lifetime of the game, but the
    // settings modal is now reachable mid-match, so follow the stored value
    // when it changes there. (This panel's own slider is session-only: it
    // never writes UserSettings, so there is no loop.)
    globalThis.addEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:settings.attackRatio`,
      this.onAttackRatioSettingChanged,
    );
  }

  init() {
    this.attackRatio = new UserSettings().attackRatio();
    this.uiState.attackRatio = this.attackRatio;
    this.eventBus.on(TutorialHighlightEvent, (e) => {
      this._tutorialHighlight = e.target;
    });
    this.eventBus.on(OnboardingLowTroopsEvent, (e) => {
      this._lowTroopsAlert = e.low;
    });
    this.eventBus.on(AttackRatioEvent, (event) => {
      let newAttackRatio = this.attackRatio + event.attackRatio / 100;

      if (newAttackRatio < 0.01) {
        newAttackRatio = 0.01;
      }

      if (newAttackRatio > 1) {
        newAttackRatio = 1;
      }

      if (newAttackRatio === 0.11 && this.attackRatio === 0.01) {
        // If we're changing the ratio from 1%, then set it to 10% instead of 11% to keep a consistency
        newAttackRatio = 0.1;
      }

      this.attackRatio = newAttackRatio;
      this.onAttackRatioChange(this.attackRatio);
    });
  }

  tick() {
    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisibile(true);
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    this.updateTroopIncrease();

    const config = this.game.config();
    this._maxTroops = config.maxTroops(player);
    this._gold = player.gold();
    this._troops = player.troops();
    this._attackingTroops = player
      .outgoingAttacks()
      .map((a) => a.troops)
      .reduce((a, b) => a + b, 0);
    this.troopRate = config.troopIncreaseRate(player) * 10;
    this.trackGoldRate(this._gold);
    const land = this.game.numLandTiles() - this.game.numTilesWithFallout();
    this._worldShare = land > 0 ? (player.numTilesOwned() / land) * 100 : 0;

    const helpEnabled = new UserSettings().helpMessages();

    // Don't target veteran players
    if (helpEnabled && getGamesPlayed() < 20) {
      // Track outgoing attacks for 15-second threshold
      this.trackOutgoingAttacks(player);

      // Refresh border detection cache periodically
      this.refreshNearbyPlayers(player);

      // Compute notification
      this._notification = this.computeNotification(player, config);
    }

    const updates = this.game.updatesSinceLastTick();
    if (updates) {
      const myID = player.id();
      const bonusEvents = updates[GameUpdateType.BonusEvent];
      if (bonusEvents) {
        for (const ev of bonusEvents) {
          if (ev.player === myID && ev.gold > 0) {
            this.addGoldGain(BigInt(ev.gold));
          }
        }
      }
      const conquestEvents = updates[GameUpdateType.ConquestEvent];
      if (conquestEvents) {
        for (const ev of conquestEvents) {
          if (ev.conquerorId === myID && ev.gold > 0n) {
            this.addGoldGain(ev.gold);
          }
        }
      }
      const donateEvents = updates[GameUpdateType.DonateEvent];
      if (donateEvents) {
        for (const ev of donateEvents) {
          if (
            ev.donationType === "gold" &&
            ev.recipientId === myID &&
            ev.amount > 0n
          ) {
            this.addGoldGain(ev.amount);
          }
        }
      }
    }

    this.requestUpdate();
  }

  /**
   * Gold per second, smoothed. Spending makes a tick's delta negative, and a
   * purchase says nothing about income, so those ticks are skipped rather
   * than counted as zero.
   */
  private trackGoldRate(gold: Gold) {
    if (this._prevGold !== null) {
      const delta = Number(gold - this._prevGold);
      if (delta >= 0) {
        this._goldRate = this._goldRate * 0.9 + delta * 10 * 0.1;
      }
    }
    this._prevGold = gold;
  }

  // Last-wins: when multiple gold events arrive in one tick, the pip shows
  // only the most recent amount (not a sum) — each gain restarts the pulse.
  private addGoldGain(amount: bigint) {
    this._goldGain = amount;
    this._goldGainPulseId++;
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
    }
    this._goldGainTimeoutId = setTimeout(() => {
      this._goldGain = null;
      this._goldGainTimeoutId = null;
      this.requestUpdate();
    }, 2000);
  }

  private trackOutgoingAttacks(player: PlayerView) {
    const currentTick = this.game.ticks();
    for (const attack of player.outgoingAttacks()) {
      if (attack.targetID !== 0 && !attack.retreating) {
        this._lastAttackTickByTarget.set(attack.targetID, currentTick);
      }
    }
    // Clean up old entries
    for (const [playerID, tick] of this._lastAttackTickByTarget.entries()) {
      if (currentTick - tick > ControlPanel.ATTACK_THRESHOLD_TICKS * 2) {
        this._lastAttackTickByTarget.delete(playerID);
      }
    }
  }

  private refreshNearbyPlayers(player: PlayerView) {
    this._borderRefreshCounter++;
    if (
      this._borderRefreshCounter < ControlPanel.BORDER_REFRESH_INTERVAL ||
      this._borderTilesPromise !== null
    ) {
      return;
    }
    this._borderRefreshCounter = 0;
    this._borderTilesPromise = player.borderTiles().then((bt) => {
      this._borderTilesPromise = null;
      const myID = player.smallID();
      const nearby = new Set<number>();
      for (const tile of bt.borderTiles) {
        for (const neighbor of this.game.neighbors(tile as TileRef)) {
          const ownerID = this.game.ownerID(neighbor);
          if (ownerID !== 0 && ownerID !== myID) {
            nearby.add(ownerID);
          }
        }
      }
      this._nearbyPlayerIDs = nearby;
    });
  }

  private computeNotification(
    player: PlayerView,
    config: Config,
  ): { type: "warning" | "info"; message: string } | null {
    const currentTick = this.game.ticks();

    // Army limit warning
    const { gameMode, gameType } = config.gameConfig();
    const isPublicTeamGame =
      gameMode === GameMode.Team && gameType === GameType.Public;
    const canDonateTroops = config.donateTroops();
    if (isPublicTeamGame && canDonateTroops) {
      const ratio = this._troops / Math.max(this._maxTroops, 1);
      if (ratio >= config.armyLimitWarningThreshold()) {
        return {
          type: "warning",
          message: "control_panel.army_limit_warning",
        };
      }
    }

    // Low troops (Less than 1k) warning
    if (this._troops < 10000 && this._troops > 0) {
      return { type: "warning", message: "control_panel.low_troops_warning" };
    }

    // Info messages: check nearby players for traitors, AFK allies, AFK teammates
    for (const nearbyID of this._nearbyPlayerIDs) {
      let other;
      try {
        other = this.game.playerBySmallID(nearbyID);
      } catch {
        continue;
      }
      if (!other.isPlayer() || !other.isAlive()) continue;

      const lastAttackTick = this._lastAttackTickByTarget.get(nearbyID) ?? -1;
      const secondsSinceAttack = (currentTick - lastAttackTick) / 10;
      const hasNotAttackedRecently =
        lastAttackTick < 0 || secondsSinceAttack > 15;

      if (!hasNotAttackedRecently) continue;

      if (other.isTraitor() && player.isAlliedWith(other)) {
        return { type: "info", message: "control_panel.traitor_neighbor_info" };
      }
      if (other.isDisconnected() && player.isAlliedWith(other)) {
        return {
          type: "info",
          message: "control_panel.allied_afk_neighbor_info",
        };
      }
      if (other.isDisconnected() && player.isOnSameTeam(other)) {
        return {
          type: "info",
          message: "control_panel.teammate_afk_neighbor_info",
        };
      }
    }

    return null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    globalThis.removeEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:settings.attackRatio`,
      this.onAttackRatioSettingChanged,
    );
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
      this._goldGainTimeoutId = null;
    }
  }

  private updateTroopIncrease() {
    const player = this.game?.myPlayer();
    if (player === null) return;
    const troopIncreaseRate = this.game.config().troopIncreaseRate(player);
    this._troopRateIsIncreasing =
      troopIncreaseRate >= this._lastTroopIncreaseRate;
    this._lastTroopIncreaseRate = troopIncreaseRate;
  }

  onAttackRatioChange(newRatio: number) {
    // The element outlives any one game; uiState only exists once init() ran.
    // Before that (the hidden slider on the lobby page) this.attackRatio holds
    // the value, and init() reloads it from UserSettings anyway.
    if (this.uiState === undefined) return;
    this.uiState.attackRatio = newRatio;
  }

  private onAttackRatioSettingChanged = () => {
    if (this.uiState === undefined) return;
    this.attackRatio = new UserSettings().attackRatio();
    this.onAttackRatioChange(this.attackRatio);
    this.requestUpdate();
  };

  setVisibile(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  private handleRatioSliderInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = Number(input.value);
    this.attackRatio = value / 100;
    this.onAttackRatioChange(this.attackRatio);
  }

  private handleRatioSliderPointerUp(e: Event) {
    (e.target as HTMLInputElement).blur();
  }

  /**
   * The browser only moves a range input on a real pointer press. A tap that
   * the radial menu forwarded down from its overlay never reaches the slider
   * as a press, so move it from the tap position here.
   */
  private handleRatioSliderClick(e: MouseEvent) {
    if (!isForwardedClick(e)) return;
    const input = e.currentTarget as HTMLInputElement | null;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    if (rect.width === 0) return;
    const min = Number(input.min);
    const max = Number(input.max);
    const position = Math.min(
      Math.max((e.clientX - rect.left) / rect.width, 0),
      1,
    );
    const value = Math.round(min + position * (max - min));
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  private calculateTroopBar(): { greenPercent: number; orangePercent: number } {
    const base = Math.max(this._maxTroops, 1);
    const greenPercentRaw = (this._troops / base) * 100;
    const orangePercentRaw = (this._attackingTroops / base) * 100;

    const greenPercent = Math.max(0, Math.min(100, greenPercentRaw));
    const orangePercent = Math.max(
      0,
      Math.min(100 - greenPercent, orangePercentRaw),
    );

    return { greenPercent, orangePercent };
  }

  private renderMobileTroopBar() {
    const { greenPercent, orangePercent } = this.calculateTroopBar();
    return html`
      <div
        class="w-full h-6 border ${
          this._lowTroopsAlert ? "border-red-500" : "border-gray-600"
        } rounded-md bg-gray-900/60 overflow-hidden relative"
      >
        <div class="relative h-full">
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-malibu-blue transition-transform duration-200 ease-out"
            style="transform: scaleX(${greenPercent / 100});"
          ></div>
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-aquarius transition-transform duration-200 ease-out"
            style="transform: translateX(${greenPercent}%) scaleX(${
              orangePercent / 100
            });"
          ></div>
        </div>
        ${
          this._lowTroopsAlert
            ? html`<div
                class="troop-bar-alert absolute inset-0 bg-red-600"
              ></div>`
            : nothing
        }
        <div
          class="absolute inset-0 flex items-center justify-between px-1.5 text-xs font-bold leading-none pointer-events-none"
          translate="no"
        >
          <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >${renderTroops(this._troops)}</span
          >
          <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >${renderTroops(this._maxTroops)}</span
          >
        </div>
        <div
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
          translate="no"
        >
          <div
            class="flex items-center gap-0.5 px-1 ${this.tutorialHighlightClass(
              "troop_rate",
            )}"
          >
            <img
              src=${soldierIcon}
              alt=""
              aria-hidden="true"
              width="12"
              height="12"
              class="brightness-0 invert drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            />
            <span
              class="text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${
                this._troopRateIsIncreasing
                  ? "text-green-400"
                  : "text-orange-400"
              }"
              >+${renderTroops(this.troopRate)}/s</span
            >
          </div>
        </div>
      </div>
    `;
  }

  private tutorialHighlightClass(target: TutorialHighlight): string {
    return this._tutorialHighlight === target ? "tutorial-highlight" : "";
  }

  private renderNotification() {
    if (!this._notification) return html``;
    const isWarning = this._notification.type === "warning";
    return html`
      <div
        class="flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-xs font-medium mb-1 ${
          isWarning
            ? "border-orange-400/60 bg-orange-400/10 text-orange-300"
            : "border-blue-400/60 bg-blue-400/10 text-blue-300"
        }"
      >
        <span class="shrink-0">${isWarning ? "⚠" : "ℹ"}</span>
        <span>${translateText(this._notification.message)}</span>
      </div>
    `;
  }

  private setAttackRatioPreset(ratio: number) {
    this.attackRatio = ratio;
    this.onAttackRatioChange(ratio);
  }

  private renderDesktop() {
    const player = this.game?.myPlayer();
    const troopsSent = (player?.troops() ?? 0) * this.attackRatio;
    const { greenPercent, orangePercent } = this.calculateTroopBar();
    const ratioPct = Math.round(this.attackRatio * 100);
    const divider = html`<div class="w-px self-stretch bg-white/10"></div>`;
    return html`
      ${this.renderNotification()}
      <div class="flex items-stretch gap-4 px-2 py-1" translate="no">
        <!-- Who: colour, name, share of the world -->
        <div class="flex min-w-[9rem] max-w-[12rem] items-center gap-2.5">
          <span
            class="size-4 shrink-0 rounded-[5px] ring-2 ring-white/20"
            style="background:${player?.territoryColor().toRgbString() ?? "#888"}"
          ></span>
          <div class="min-w-0">
            <div
              class="truncate font-display text-base font-bold leading-tight"
            >
              ${player?.displayName() ?? ""}
            </div>
            <div class="text-xs text-white/65">
              ${translateText("hud.world_share", {
                percent: this._worldShare.toFixed(2),
              })}
            </div>
          </div>
        </div>
        ${divider}
        <!-- Troops: current / max, growth, the bar, what is at war -->
        <div
          class="flex min-w-[10.5rem] flex-col justify-center ${this.tutorialHighlightClass("troops")}"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="tc-label text-[0.7rem] text-white/60"
              >${translateText("hud.troops")}</span
            >
            <span
              class="text-xs font-bold tabular-nums ${this.tutorialHighlightClass(
                "troop_rate",
              )} ${
                this._troopRateIsIncreasing
                  ? "text-[var(--tc-green)]"
                  : "text-orange-400"
              }"
              >+${renderTroops(this.troopRate)}/s</span
            >
          </div>
          <div class="leading-tight">
            <span class="font-display text-xl font-bold tabular-nums"
              >${renderTroops(this._troops)}</span
            >
            <span class="text-sm text-white/55 tabular-nums">
              / ${renderTroops(this._maxTroops)}</span
            >
          </div>
          <div
            class="relative mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10 ${
              this._lowTroopsAlert ? "ring-1 ring-red-500" : ""
            }"
          >
            <div
              class="absolute inset-y-0 left-0 w-full origin-left bg-[var(--tc-cyan)] transition-transform duration-200 ease-out"
              style="transform: scaleX(${greenPercent / 100});"
            ></div>
            <div
              class="absolute inset-y-0 left-0 w-full origin-left bg-orange-400 transition-transform duration-200 ease-out"
              style="transform: translateX(${greenPercent}%) scaleX(${
                orangePercent / 100
              });"
            ></div>
          </div>
          ${
            this._attackingTroops > 0
              ? html`<span
                  class="mt-0.5 text-[11px] font-semibold text-orange-300"
                  >${translateText("hud.at_war", {
                    troops: renderTroops(this._attackingTroops),
                  })}</span
                >`
              : nothing
          }
        </div>
        ${divider}
        <!-- Attack share: preset chips; the wheel and the settings still work -->
        <div
          class="flex flex-col justify-center ${this.tutorialHighlightClass("attack_ratio")}"
        >
          <div class="flex items-center justify-between gap-3">
            <span
              class="tc-label flex items-center gap-1 text-[0.7rem] text-white/60"
            >
              <img
                src=${swordIcon}
                alt=""
                aria-hidden="true"
                width="11"
                height="11"
                style="filter: brightness(0) invert(0.6);"
              />
              ${translateText("hud.attack")}
            </span>
            <span class="text-sm font-bold text-[var(--tc-accent)] tabular-nums"
              >${ratioPct}%</span
            >
          </div>
          <div class="mt-1 flex gap-1">
            ${ATTACK_PRESETS.map(
              (preset) =>
                html`<button
                  class="tc-ratio-chip ${
                    Math.round(preset * 100) === ratioPct ? "active" : ""
                  }"
                  data-radial-click-through
                  @click=${() => this.setAttackRatioPreset(preset)}
                >
                  ${Math.round(preset * 100)}%
                </button>`,
            )}
          </div>
          <span class="mt-1 text-[11px] text-white/55">
            ${translateText("hud.sends", { troops: renderTroops(troopsSent) })}
          </span>
        </div>
        ${divider}
        <!-- Gold and its income -->
        <div
          class="relative flex min-w-[6.5rem] flex-col justify-center ${this.tutorialHighlightClass("gold")}"
        >
          ${
            this._goldGain !== null
              ? keyed(
                  this._goldGainPulseId,
                  html`<span
                    class="gold-gain-pop absolute -top-4 right-0 text-green-400 text-sm font-extrabold tabular-nums whitespace-nowrap pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
                    >+${renderNumber(this._goldGain)}</span
                  >`,
                )
              : nothing
          }
          <div class="flex items-center justify-between gap-3">
            <span
              class="tc-label flex items-center gap-1 text-[0.7rem] text-white/60"
            >
              <img
                src=${goldCoinIcon}
                width="11"
                height="11"
                alt=""
                aria-hidden="true"
              />
              ${translateText("hud.gold")}
            </span>
            <span class="text-xs font-bold text-[var(--tc-green)] tabular-nums"
              >+${renderNumber(Math.round(this._goldRate))}/s</span
            >
          </div>
          <div
            class="font-display text-xl font-bold leading-tight text-amber-300 tabular-nums"
          >
            ${renderNumber(this._gold)}
          </div>
        </div>
      </div>
    `;
  }

  private getMobileAttackRatioLabel(): string {
    const percent = (this.attackRatio * 100).toFixed(0);
    const troops = renderTroops(
      (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio,
    );
    const translated = translateText("control_panel.attack_ratio", {
      percent,
      troops,
    });
    return translated !== "control_panel.attack_ratio" &&
      translated.includes(percent)
      ? translated
      : `${percent}%\n(${troops})`;
  }

  private renderMobile() {
    return html`
      ${this.renderNotification()}
      <div class="flex gap-2 items-center">
        <!-- Gold -->
        <div
          class="flex items-center justify-center p-1 gap-0.5 border rounded-md border-yellow-400 font-bold text-yellow-400 text-xs w-1/5 shrink-0 relative ${this.tutorialHighlightClass(
            "gold",
          )}"
          translate="no"
        >
          ${
            this._goldGain !== null
              ? keyed(
                  this._goldGainPulseId,
                  html`<span
                    class="gold-gain-pop absolute -top-5 right-[5px] min-[1015px]:right-[9px] text-green-400 text-xs font-extrabold tabular-nums whitespace-nowrap pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
                    >+${renderNumber(this._goldGain)}</span
                  >`,
                )
              : ""
          }
          <img src=${goldCoinIcon} width="13" height="13" />
          <span class="px-0.5">${renderNumber(this._gold)}</span>
        </div>
        <!-- Troop bar -->
        <div
          class="w-[40%] shrink-0 flex items-center ${this.tutorialHighlightClass(
            "troops",
          )}"
        >
          ${this.renderMobileTroopBar()}
        </div>
        <!-- Sword + % and troop count label -->
        <div class="flex flex-col items-center justify-center shrink-0">
          <div class="flex items-center gap-0.5">
            <img
              src=${swordIcon}
              alt=""
              aria-hidden="true"
              width="10"
              height="10"
              style="filter: brightness(0) invert(1);"
            />
            <span
              class="text-white text-[11px] font-bold tabular-nums text-center leading-tight whitespace-pre-wrap"
              >${this.getMobileAttackRatioLabel()}</span
            >
          </div>
        </div>
        <!-- Attack ratio slider -->
        <div
          class="flex-1 min-w-0 ${this.tutorialHighlightClass("attack_ratio")}"
          translate="no"
        >
          <input
            type="range"
            min="1"
            max="100"
            .value=${String(Math.round(this.attackRatio * 100))}
            @input=${(e: Event) => this.handleRatioSliderInput(e)}
            @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
            @click=${(e: MouseEvent) => this.handleRatioSliderClick(e)}
            data-radial-click-through
            class="w-full h-1.5 accent-aquarius cursor-pointer"
          />
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <style>
        @keyframes gold-gain-pop {
          0% {
            transform: translateY(4px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .gold-gain-pop {
          animation: gold-gain-pop 0.25s ease-out;
        }
      </style>
      <div
        class="relative pointer-events-auto ${
          this._isVisible
            ? "relative w-full text-sm px-2 py-1 lg:px-0 lg:py-0"
            : "hidden"
        }"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div class="lg:hidden">${this.renderMobile()}</div>
        <div class="hidden lg:block">${this.renderDesktop()}</div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
