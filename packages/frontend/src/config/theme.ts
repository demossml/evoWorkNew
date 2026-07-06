/**
 * Hex mirrors of the `--background` token in src/index.css.
 *
 * Telegram's native chrome APIs (WebApp.setBackgroundColor /
 * setHeaderColor) only accept literal hex strings, not CSS variables, so
 * this is the one place that bridges the two. If the background token in
 * index.css changes, update these two values to match — otherwise
 * Telegram's own chrome (status bar, safe-area fill) will visibly mismatch
 * the app's background on load.
 */
export const TELEGRAM_BG = { light: "#f9fafb", dark: "#080c16" } as const;
