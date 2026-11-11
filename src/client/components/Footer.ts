import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  composeVersionDisplay,
  desktopVersion,
  isDesktopShell,
} from "../DesktopShell";
import { currentGameVersion } from "../GameVersion";

/**
 * Where this build's source code is published (AGPL v3 §13 requires offering
 * it to network users). Points at upstream until the fork has its own public
 * repository: change it to the fork's URL before deploying.
 */
const SOURCE_CODE_URL = "https://github.com/openfrontio/OpenFrontIO";

@customElement("page-footer")
export class Footer extends LitElement {
  // Per instance, not at module scope: currentGameVersion reads
  // BOOTSTRAP_CONFIG, which the server injects into the page and which is not
  // guaranteed to exist at the moment this module is first imported.
  private readonly gameVersion = currentGameVersion();

  // Starts as the game version alone and gains the shell version once the
  // bridge answers, so the line is never blank while that call is in flight.
  @state() private versionLabel = this.gameVersion;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // desktopVersion() resolves null off the desktop shell and on its own
    // timeout, so this can only ever leave the label as-is or extend it.
    void desktopVersion().then((shellVersion) => {
      this.versionLabel = composeVersionDisplay(this.gameVersion, shellVersion);
    });
  }

  render() {
    // Scaled to 3/4 on compact screens (styles.css), like the nav bar, from sm
    // up so phones keep their full-size footer.
    // One quiet line, as in the menu reference: the AGPL notice the licence
    // requires to stay visible, where the source is, and the legal pages.
    return html`
      <footer
        class="[.in-game_&]:hidden relative z-50 flex w-full shrink-0 flex-col items-center justify-center gap-1 px-4 pb-3 pt-2 text-xs text-white/55 sm:compact:[zoom:0.75]"
      >
        ${
          isDesktopShell()
            ? html`<div class="footer-version text-center">
                ${this.versionLabel}
              </div>`
            : nothing
        }
        <div
          class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center"
        >
          <span data-i18n="main.copyright"></span>
          <span aria-hidden="true">·</span>
          <a
            href=${SOURCE_CODE_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-white transition-colors"
            data-i18n="main.license_notice"
          ></a>
          <span aria-hidden="true">·</span>
          <a
            href="/terms-of-service.html"
            data-i18n="main.terms_of_service"
            target="_blank"
            class="hover:text-white transition-colors"
          ></a>
          <span aria-hidden="true">·</span>
          <a
            href="/privacy-policy.html"
            data-i18n="main.privacy_policy"
            target="_blank"
            class="hover:text-white transition-colors"
          ></a>
        </div>

        <!-- Single instance: translateText() resolves the active language via
             document.querySelector("lang-selector"), so a second one would
             shadow it. -->
        <lang-selector
          class="absolute right-4 top-1/2 -translate-y-1/2"
        ></lang-selector>
      </footer>
    `;
  }
}
