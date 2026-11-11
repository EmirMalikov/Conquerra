/**
 * What this build ships with. Conquerra has no ads and nothing to buy: the
 * upstream ad stack (Playwire/RAMP, Admiral, Google Ad Manager), the portal
 * ad breaks (Poki, CrazyGames) and the store/checkout code are still in the
 * tree, but these flags keep every one of them from running. A platform that
 * wants ads adds its own integration.
 */

/** Any ad: banners, rails, in-game promos and portal ad breaks. */
export const ADS_ENABLED = false;

/**
 * The store, checkout (Stripe), subscriptions, crates/rewards and every
 * purchase prompt. Off: those pages and buttons are hidden.
 */
export const MONETIZATION_ENABLED = false;
