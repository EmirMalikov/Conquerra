import { assetUrl } from "@openfront/shared/AssetUrls";
import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { translateText } from "../Utils";

/**
 * The game's logo: our own emblem (resources/images/GameEmblem.svg) next to
 * the game's name set in the display font. The name lives in one translation
 * key (main.game_name), so renaming the game is a one-line change.
 */
@customElement("game-wordmark")
export class GameWordmark extends LitElement {
  /** "sm" for nav bars, "lg" for the big menu title. */
  @property({ type: String }) size: "sm" | "lg" = "sm";

  createRenderRoot() {
    return this;
  }

  render() {
    const large = this.size === "lg";
    return html`
      <span
        class="inline-flex items-center ${large ? "gap-3" : "gap-2"} select-none"
      >
        <img
          src=${assetUrl("images/GameEmblem.svg")}
          alt=""
          class="${large ? "h-14 w-14" : "h-8 w-8"} shrink-0"
          draggable="false"
        />
        <span
          class="font-display font-bold uppercase tracking-wide text-white ${
            large ? "text-4xl" : "text-xl"
          } [text-shadow:0_2px_0_#b45309,0_4px_8px_rgb(0_0_0/0.45)]"
          >${translateText("main.game_name")}</span
        >
      </span>
    `;
  }
}
