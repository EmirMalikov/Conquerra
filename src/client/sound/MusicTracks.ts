/**
 * The music this build ships. The upstream tracks live in proprietary/ (All
 * Rights Reserved) and are not ours to use, so both lists are empty and the
 * game plays effects and ambience only. To add music, put freely licensed
 * tracks (CC0 / CC BY / CC BY-SA) under resources/sounds/music/, credit them
 * in CREDITS.md, and list their paths here.
 */

/** The home page theme, or null for none. */
export const MENU_THEME_PATH: string | null = null;

/**
 * The gameplay playlist. A game starts on a random track and plays the rest
 * in order, round and round, so short games do not always hear the same one.
 */
export const GAMEPLAY_TRACKS: readonly string[] = [];
