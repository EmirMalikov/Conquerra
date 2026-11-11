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

/**
 * Whether this build has upstream's account/server-list API (cluster.json on
 * api.<domain>). Conquerra has none, so the client always falls back to the
 * game server that served the page. With this off, that API being
 * unreachable is expected and never blocks Invite, Join with code or the
 * public match list: the game server answers those itself.
 */
export const SERVER_LIST_API_ENABLED = false;
