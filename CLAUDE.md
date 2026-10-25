# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Reptyle Stash Model Link

Tampermonkey userscript for desktop Chrome that links model pages of supported sites (one adapter per site; Reptyle so far) to the matching performer in your local [Stash](https://stashapp.cc) (`http://localhost:9999`). Independent of the other userscripts in the docker-stuff workspace; it is set up like `colum-manager` (one dependency-free userscript, no build step).

@AGENTS.md

## Project map

- `reptyle-stash-model-link.user.js` is the installable userscript, written in the original ES5 `var` style. `SITES` (site adapters: paths, selectors, `sceneUrlParts`, optional `nameFromUrl`, `anchorSel` (empty = floating panel), `sceneKey`/`modelKey`/`modelUrl`) sits above the `module.exports` guard; the core picks the adapter with `siteFor(location.hostname)` and reads every page-specific value from it. `SITES`, `siteFor` and the pure helpers (`normUrl`, `normTitle`, `normName`, `extractMovieId`, `extractModelId`, `extractGammaSceneId`, `extractGammaActorId`, `gammaNameFromUrl`) are exported for tests; everything else needs the page.
- Each adapter host needs a whole-site `@match`; `test/core.test.cjs` fails if `@match` and the adapter hosts differ. Stash usually stores public tour URLs while members areas use other hosts, so scenes are matched by `sceneKey`, not by full URL. Adult Time (Gamma) shares scene ids across all Gamma sites, so its adapter reads every `/en/video/` URL in Stash. Video cards are the outermost `videoCardSel` matches that link exactly one scene (`videoCards`); an empty `videoCardSel`/`modelCardSel` switches to `structuralCard` (Brazzers). `modelParam`/`modelNameParam` make filtered pages (`?models=<id>`, Adult Time "See all") model pages; `performerUrlParts(id)` finds the performer by id first; model pages are remembered with `GM_setValue` (`model:<site>:<id>` and `model:<site>:name:<name>`).
- `markModelCards` carries a documented `eslint-disable-next-line no-loop-func`: its handlers read the shared performer cache at click time on purpose.
- `test/core.test.cjs` is the only test file (Node's built-in runner). `tools/` holds the two lint entry points copied from `colum-manager`; both read `<package name>.user.js`.

## Validation

- `npm run check` = `lint` + `test` + `version-bump` (fails if the userscript differs from `origin/master` without a higher `@version`; installs auto-update from there). `lint` runs the Tampermonkey 5.5.1 ESLint worker from the Windows Chrome profile and fails if that extension version is not installed; it also asserts `@version` equals the runtime `VERSION`.
- `npm run check:ci` = `lint:ci` + `test` + `version-bump` (needs `npm ci --prefix tools/lint-ci` once). `.github/workflows/ci.yml` runs it.
- Single test file: `node --test test/core.test.cjs`.
- Releasing: bump `@version`, `VERSION` and `package.json` together (currently 8.2.0), then follow AGENTS.md. Installed copies auto-update from the raw file on `master` (`@updateURL`/`@downloadURL`, asserted by a test), so every push that changes the script must raise `@version`, and a broken push reaches every install. Keep `@name`/`@namespace` unchanged so Tampermonkey updates the installed script instead of adding a second one.

## Architecture

- One IIFE; sites like Reptyle are single-page apps, so the script matches whole sites and acts on the current path. Keep page changes idempotent and never rely on a load event per page.
- Grants: `GM_xmlhttpRequest` (Stash) and `GM_getValue`/`GM_setValue` (remembered model pages). Network access is only through `GM_xmlhttpRequest` and the matching `@connect` entries; `siderRuntime` (the runtime the code was originally written for) must not come back.
- The only Stash write is `performerUpdate` in `addPerformerUrl`, which always asks `confirm()` first.
- Never store session tokens, `?r=` parameters, cookies, HAR data, signed URLs or account names in this repository.
- Running it for real needs Tampermonkey in desktop Chrome, a logged-in session on the site and a running local Stash; none of that is available to the tests.
