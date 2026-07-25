/**
 * Bundle entry point for OpenCode's plugin loader.
 *
 * OpenCode's loader (`getLegacyPlugins` in the compiled app) does
 * `Object.values(module)` and throws `TypeError("Plugin export is not a
 * function")` if any exported value isn't a function (or `{ server: fn }`).
 *
 * `./index.ts` also exports two allowlist arrays — `REAL_OPENCODE_EVENT_TYPES`
 * and `REGISTERED_OPENCODE_HOOKS` — purely so
 * tests/integrations/opencode-plugin-contract.test.ts can assert the plugin
 * only ever touches real OpenCode hook/event names. Those arrays are not
 * functions; if the bundle OpenCode actually imports re-exports them, the
 * loader throws on load and the plugin silently never registers. Confirmed
 * by decompiling OpenCode's app.asar (Contents/Resources/app.asar) — the
 * `getLegacyPlugins` loader is the exact source of the "failed to load
 * plugin" error this repo's own capture pipeline hit in the wild.
 *
 * This file is the esbuild entry point for `dist/opencode-plugin/index.js`
 * (the file OpenCode's plugin loader imports directly) and re-exports only
 * the function-shaped members. `./index.ts` stays the entry point for tests,
 * which need the arrays.
 */
export { ClaudeMemPlugin, default, parseSearchResponse } from "./index.js";
