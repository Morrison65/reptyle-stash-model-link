# reptyle-stash-model-link

Tampermonkey userscript for **desktop Chrome** that links model pages of supported sites to the matching performer in your local [Stash](https://stashapp.cc) (`http://localhost:9999`). Version **8.4.1**. Supported so far: Reptyle (`app.reptyle.com`), Adult Time members (`members.adulttime.com`) and Brazzers members (`site-ma.brazzers.com`); more sites follow as adapters.

**v8.4.1**: because a performer can now come from a stored list, both add-URL buttons read the performer's current URLs from Stash right before the update and append to those (the update replaces the whole list), so URLs added elsewhere in the meantime are kept.

**v8.4.0** keeps the two bulk Stash lists, all performers and each site's scenes, in Tampermonkey storage. That storage belongs to the script, not to a site, so a list fetched on one site is reused by every other site and tab (`localStorage` would be per site). A stored list is used at once on the next page; when it is older than 10 minutes it is fetched again in the background while the stored copy keeps serving, and one older than a day is ignored. Adding a URL to a performer drops the stored performer list, so the next page fetches it fresh. The per-model lookups (performer by id or name, the performer's scenes for the title match) still ask Stash live. Something you change in Stash directly shows up within 10 minutes.

**v8.3.0** marks what Stash has on every page of a supported site, not only on model pages: video cards by the site's scene id and model links by the model id in a saved performer URL (`performerUrlRe` limits which saved URLs count per site), and drops marks from cards the single-page app reuses for other scenes.

**v8.2.0** adds the Brazzers adapter and model-filtered pages:
- **Brazzers** model pages (`/model/<id>/<slug>`): the performer is found first by the model id in a saved Stash URL (`brazzers.com/pornstar/<id>/` or `brazzers.com/model/<id>/`), then by the name from the URL. Videos match by the Aylo scene id, which members links (`/scene/<id>/`) share with the tour URLs Stash holds (`brazzers.com/video/<id>/`). Brazzers class names are build hashes, so cards are found by structure: the largest element around a link that holds only that one scene or model.
- **Pages filtered to one model** count as that model's page: Brazzers `?models=<id>` (for example `/scenes?addon=…&models=65308`) and Adult Time's "See all" list `/en/videos?refinementList[actors.name][0]=<Name>`. Model pages remember their name and URL (Tampermonkey storage, `GM_setValue`), so a filtered page knows them later; a Brazzers id that is neither remembered nor in Stash is named from the model links on the page once its cards load.
- A filtered page with no known model page has no URL to save, so it shows no add button.

**v8.2.1** keeps the floating panel (Adult Time, Brazzers) small: at most 340px wide, height capped to the window with its own scrolling, saved URLs folded into a "Saved URLs (n)" list, and a toggle (top right) that folds the panel to its summary lines; the fold state is remembered.

**v8.1.0** adds the Adult Time adapter: on a pornstar page (`/en/pornstar/view/<Name>/<id>`) the name comes from the URL and the panel floats at the top right; videos are matched by the Gamma scene id, which is the same on every Gamma site, so scenes Stash holds under evilangel.com, puretaboo.com, tabooheat.com and the other `/en/video/` sites count too. Its card selectors (`.ListingGrid-ListingGridItem`, `SceneThumb`) come from the members listing; the pornstar page itself was not available to test, so model-listing marks on `/en/pornstars` are a best guess. Also new: the video count follows cards that render late, and names compare without accents or punctuation. **v8.1.1** reads the Adult Time video title from the card's `h2.Title` (the scene link only wraps the image), so the title fallback and the green title work there; the card structure was confirmed from a members `/en/videos/` page.

**v8.0.0** splits the script into a generic core and one adapter per site (the `SITES` array at the top of the script). The Reptyle adapter carries exactly the v7 selectors, so Reptyle behaves as before, with three deliberate changes: both add-URL buttons now ask for confirmation before writing to Stash; performers also match by alias; and the Stash scene lookup pages through all scenes of the site instead of stopping at 500. The `@name` and `@namespace` stay the same so Tampermonkey updates the installed v7 script in place.

**v7.0.0** is the first release in its own repository. The code was supplied as a Sider code-agent preview (`siderRuntime`), not as a Tampermonkey script, and was ported: `fetch` to Stash became `GM_xmlhttpRequest` with `@connect localhost`; the Sider-only `@bound-url`/`@changelog` headers were dropped; `@match` was widened from `/models` and `/models/*` to the whole site because Reptyle is a single-page app and a narrow match never runs when you arrive from another page (the script already ignores other paths).

Original v7 behavior: also mark in-Stash video titles green with a checkmark.

## Install

1. In Chrome/Edge, turn on **Allow User Scripts** for Tampermonkey (extension details → right-click the icon → Manage extension), otherwise no userscript runs.
2. Open the [raw userscript on `master`](https://raw.githubusercontent.com/Morrison65/reptyle-stash-model-link/master/reptyle-stash-model-link.user.js); Tampermonkey shows its install page, click **Install** (or **Update** over an earlier version).
3. Reload the tab of the supported site. When Tampermonkey asks about cross-origin requests, review the `@connect` entries below and choose **Always allow**.

Runs only on the hosts of its adapters, currently `https://app.reptyle.com/*`, `https://members.adulttime.com/*` and `https://site-ma.brazzers.com/*` (top frame only).

## Updates

Since **v8.0.1** the script carries `@updateURL`/`@downloadURL` pointing at the raw file on `master`. Tampermonkey checks that URL on its update interval (default daily; **Utilities → Check for userscript updates** or the script's *Last updated* column forces it) and installs a pushed version when its `@version` is higher. A push without a version bump is not picked up, so `npm run check` and CI refuse a changed userscript whose `@version` is not higher than on `origin/master` (`tools/check-version-bump.cjs`). A copy imported from a file before v8.0.1 has no update URL; install it once from the link above.

## What it does

- **Model page** (`/models/<id>`): a panel under the name. If a performer with exactly that name exists in Stash the name turns green with a checkbox and the panel shows **View in Stash**; if the page URL is not saved on the performer, **Add this URL in Stash** appends it after a confirmation (a `performerUpdate` mutation, the only write the script makes). Names match the performer's name or one of its aliases. Otherwise it lists the closest fuzzy matches. A **Retry** button appears when Stash is unreachable.
- **Videos on a model page** (Reptyle: `.movies-thumb-entry`): titles already in Stash (matched by the site's scene id in a stored URL, or by normalised title among the performer's scenes) are marked green with a check and an "in Stash" badge, and the panel counts them.
- **Model listing** (Reptyle: `/models`): every model that exists in Stash gets an `IN STASH` badge, and a `+ URL` button (with confirmation) when its page URL is not saved yet.
- **Every other page** of a supported site: video cards and model links already in Stash are marked too (by id only).
- Re-checks every two seconds, so in-app navigation and infinite scrolling are followed.

## Adding a site

Add an object to `SITES` and an `@match https://<host>/*` per host (a test checks that both agree). The fields are commented at the top of the script: page path patterns for model detail and listing pages, CSS selectors for the name, video cards and model cards, URL fragments that select that site's scenes in Stash (`sceneUrlParts`, a host or a path such as `/en/video/`), an `anchorSel` for the panel (empty for a floating panel), an optional `nameFromUrl`, and `sceneKey`/`modelKey`, which reduce a URL to the id or slug that the site's links and the URLs in Stash have in common. Members areas often use other hosts than the public URLs the Stash scrapers save, which is why the key, not the full URL, is compared. The URL patterns in the Stash community scrapers (`stash/config`, `scrapers/community/`) show which hosts and paths each network uses.
## Permissions

- `@connect localhost`: GraphQL calls to `http://localhost:9999/graphql`. Tampermonkey asks once; choose **Always allow**. If your Stash runs elsewhere, change `STASH_ORIGIN` and add a matching `@connect`.
- `@grant GM_xmlhttpRequest` for Stash, `GM_getValue`/`GM_setValue` to remember model pages (name and URL per site id), the panel fold state, and the shared Stash lists (`cache:v1:performers`, `cache:v1:scenes:<url part>`: ids, names, aliases, titles and URLs from your Stash, kept only in Tampermonkey's local extension storage). To clear the lists, delete those keys in the script's **Storage** tab in Tampermonkey (shown in the advanced config mode); they are refetched on the next page. Tampermonkey may ask to confirm the new grants once when it updates to 8.2.0.

## Checks

```bash
npm run check      # lint (Tampermonkey 5.5.1 rule set) + unit tests + browser test + version bump check
```

`npm run lint` needs desktop Chrome with Tampermonkey 5.5.1 installed (set `TAMPERMONKEY_EXTENSION_DIR` to override); `npm run check:ci` uses the pinned stand-in after `npm ci --prefix tools/lint-ci`. Unit tests cover metadata/grant consistency, adapter completeness and host selection, the `@match`/adapter agreement and the pure helpers. `npm run test:browser` (part of `npm run check`, not of CI) runs every adapter in headless Chrome on stub pages with stubbed Tampermonkey APIs: panel, matches by id and title, confirm before writes, filtered model pages, late-rendering cards, the 2-second re-check, and the shared Stash lists (GM storage in the test is one store for all hosts, as in Tampermonkey: lists are reused across sites, dropped after a write and refetched when stale). It needs desktop Chrome (`CHROME_PATH` overrides the path). Stub pages are not the live sites: real selectors are only confirmed where a page capture or report was available.
