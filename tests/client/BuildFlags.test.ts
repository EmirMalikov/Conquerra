import { describe, expect, it, vi } from "vitest";
import { ADS_ENABLED, MONETIZATION_ENABLED } from "../../src/client/BuildFlags";
import "../../src/client/components/PurchaseButton";
import "../../src/client/components/SaleBanner";
import "../../src/client/components/SteamWishlistButton";
import { PokiSDK } from "../../src/client/poki/PokiSDK";

// This build ships without ads or anything to buy. These pin that down at
// the places a player would otherwise meet them.
describe("Conquerra build flags", () => {
  it("ships with ads and monetization off", () => {
    expect(ADS_ENABLED).toBe(false);
    expect(MONETIZATION_ENABLED).toBe(false);
  });

  it.each(["purchase-button", "sale-banner", "steam-wishlist-button"])(
    "<%s> renders nothing",
    async (tag) => {
      const el = document.createElement(tag) as HTMLElement & {
        updateComplete: Promise<unknown>;
      };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(el.querySelector("*")).toBeNull();
      el.remove();
    },
  );

  it("never asks Poki for a commercial break", async () => {
    const sdk = new PokiSDK();
    const commercialBreak = vi.fn(async () => {});
    // Pretend the SDK is up: the flag alone must stop the ad.
    Object.assign(sdk as object, {
      sdk: { commercialBreak, gameplayStop: vi.fn() },
      isReady: () => true,
    });
    await sdk.requestMidgameAd();
    expect(commercialBreak).not.toHaveBeenCalled();
  });
});
