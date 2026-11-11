import { assetUrl } from "@openfront/shared/AssetUrls";
import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "./Utils";

@customElement("game-starting-modal")
export class GameStartingModal extends LitElement {
  @state()
  isVisible = false;

  createRenderRoot() {
    return this;
  }

  render() {
    const isVisible = this.isVisible;
    return html`
      <div
        class="fixed inset-0 bg-black/30 backdrop-blur-[4px] z-[9998] transition-all duration-300 ${
          isVisible ? "opacity-100 visible" : "opacity-0 invisible"
        }"
      ></div>
      <div
        class="tc-panel fixed top-1/2 left-1/2 p-6 z-[9999] text-white w-[min(400px,92vw)] text-center transition-all duration-300 -translate-x-1/2 ${
          isVisible
            ? "opacity-100 visible -translate-y-1/2"
            : "opacity-0 invisible -translate-y-[48%]"
        }"
      >
        <img
          src=${assetUrl("images/GameEmblem.svg")}
          alt=""
          class="mx-auto mb-2 size-14"
          draggable="false"
        />
        <div class="tc-title mb-3 text-4xl">
          ${translateText("main.game_name")}
        </div>
        <div
          class="text-sm font-medium tracking-wider uppercase text-white/55 mb-3"
        >
          ${translateText("main.copyright")}
        </div>
        <a
          href="https://github.com/openfrontio/OpenFrontIO/blob/main/CREDITS.md"
          target="_blank"
          rel="noopener noreferrer"
          class="block mb-4 text-lg font-medium tracking-wider uppercase text-[var(--tc-accent)] no-underline transition-colors duration-200 hover:text-white"
          >${translateText("game_starting_modal.credits")}</a
        >
        <p class="text-base text-white/40 mb-4">
          ${translateText("game_starting_modal.code_license")}
        </p>
        <p
          class="text-xl font-medium tracking-wider text-white bg-white/5 border border-white/10 px-4 py-3 rounded-xl"
        >
          ${translateText("game_starting_modal.title")}
        </p>
      </div>
    `;
  }

  show() {
    this.isVisible = true;
    this.requestUpdate();
  }

  hide() {
    this.isVisible = false;
    this.requestUpdate();
  }
}
