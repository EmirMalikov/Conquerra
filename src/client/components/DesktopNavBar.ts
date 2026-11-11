import { assetUrl } from "@openfront/shared/AssetUrls";
import { LitElement, html, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { MONETIZATION_ENABLED } from "../BuildFlags";
import { UserSettings } from "../UserSettings";
import "./NavAccountMenu";
import "./NavUtilityIcons";
import { translateText } from "../Utils";

/** Where the sound button keeps the volume to restore on unmute. */
const LAST_MASTER_VOLUME_KEY = "tc.lastMasterVolume";

@customElement("desktop-nav-bar")
export class DesktopNavBar extends LitElement {
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("showPage", this._onShowPage);

    const current = window.currentPageId;
    if (current) {
      // Wait for render
      void this.updateComplete.then(() => {
        this._updateActiveState(current);
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("showPage", this._onShowPage);
  }

  private _onShowPage = (e: Event) => {
    const pageId = (e as CustomEvent).detail;
    this._updateActiveState(pageId);
  };

  private _updateActiveState(pageId: string) {
    this.querySelectorAll(".nav-menu-item").forEach((el) => {
      if ((el as HTMLElement).dataset.page === pageId) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  @state() private menuOpen = false;
  @state() private muted = new UserSettings().audioVolume("master") === 0;

  private toggleMenu = (e: Event) => {
    e.stopPropagation();
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      document.addEventListener("click", this.closeMenu, { once: true });
    }
  };

  private closeMenu = () => {
    this.menuOpen = false;
  };

  /** One-click mute: master volume to 0, and back to what it was before. */
  private toggleSound = () => {
    const settings = new UserSettings();
    const current = settings.audioVolume("master");
    if (current > 0) {
      try {
        localStorage.setItem(LAST_MASTER_VOLUME_KEY, String(current));
      } catch {
        // Storage can be blocked; unmuting then falls back to full volume.
      }
      settings.setAudioVolume("master", 0);
      this.muted = true;
    } else {
      let restore = 1;
      try {
        restore = Number(localStorage.getItem(LAST_MASTER_VOLUME_KEY)) || 1;
      } catch {
        // See above.
      }
      settings.setAudioVolume("master", restore);
      this.muted = false;
    }
  };

  private pageLink(page: string, labelKey: string, extra = "") {
    const active = window.currentPageId === page;
    return html`<button
      class="nav-menu-item ${active ? "active" : ""} ${extra} block w-full rounded-lg px-3 py-2 text-left font-display text-sm font-semibold uppercase tracking-[0.12em] text-white/80 hover:bg-white/10 hover:text-white [&.active]:text-[var(--tc-accent)]"
      data-page=${page}
      data-i18n=${labelKey}
      @click=${this.closeMenu}
    ></button>`;
  }

  render() {
    window.currentPageId ??= "page-play";

    // Scaled to 3/4 on compact screens (styles.css), e.g. Poki's frame. The bar,
    // not the sticky host, so the host's offset below a header ad stays exact.
    return html`
      <nav
        class="hidden lg:flex w-full items-center justify-between gap-4 px-5 py-4 shrink-0 z-50 relative compact:[zoom:0.75]"
      >
        <!-- Round icon cluster: menu, sound, then help/settings/news. -->
        <div class="flex items-center gap-2">
          <button
            class="nav-menu-item tc-round-btn ${
              window.currentPageId === "page-play" ? "active" : ""
            }"
            data-page="page-play"
            data-i18n-aria-label="main.play"
            data-i18n-title="main.play"
          >
            <img
              src=${assetUrl("images/GameEmblem.svg")}
              alt=""
              class="size-7 pointer-events-none"
              draggable="false"
            />
          </button>
          <div class="relative">
            <button
              class="tc-round-btn ${this.menuOpen ? "active" : ""}"
              data-i18n-aria-label="main.menu"
              data-i18n-title="main.menu"
              aria-haspopup="menu"
              aria-expanded=${this.menuOpen ? "true" : "false"}
              @click=${this.toggleMenu}
            >
              <svg
                viewBox="0 0 24 24"
                class="size-6 pointer-events-none"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <div
              class="tc-panel absolute left-0 top-full mt-2 w-56 p-2 ${
                this.menuOpen ? "" : "hidden"
              }"
              role="menu"
            >
              ${this.pageLink("page-play", "main.play")}
              ${this.pageLink("page-leaderboard", "main.leaderboard")}
              ${this.pageLink("page-clan", "main.clans", "no-game-portal")}
              ${
                MONETIZATION_ENABLED
                  ? this.pageLink(
                      "page-item-store",
                      "main.store",
                      "no-game-portal",
                    )
                  : nothing
              }
              ${this.pageLink("page-inventory", "main.inventory")}
            </div>
          </div>
          <button
            class="tc-round-btn"
            aria-label=${translateText("main.sound")}
            title=${translateText("main.sound")}
            aria-pressed=${this.muted ? "true" : "false"}
            @click=${this.toggleSound}
          >
            <svg
              viewBox="0 0 24 24"
              class="size-6 pointer-events-none"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18V5l11-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="17" cy="16" r="3" />
              ${
                this.muted
                  ? svg`<path d="M3 3l18 18" stroke="#ff5a5a" stroke-width="2.6" />`
                  : nothing
              }
            </svg>
          </button>
          <nav-utility-icons size="desktop"></nav-utility-icons>
        </div>

        <div class="flex items-center gap-3">
          <div
            id="game-version"
            class="l-header__highlightText text-right text-xs text-white/50"
          ></div>
          <nav-account-menu variant="desktop"></nav-account-menu>
        </div>
      </nav>
    `;
  }
}
