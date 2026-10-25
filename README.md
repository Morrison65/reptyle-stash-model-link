# reptyle-stash-model-link

Tampermonkey userscript for **desktop Chrome** that links model pages of supported sites to the matching performer in your local [Stash](https://stashapp.cc) (`http://localhost:9999`). Version **8.0.1**. Supported so far: Reptyle (`app.reptyle.com`); more sites follow as adapters.

**v8.0.0** splits the script into a generic core and one adapter per site (the `SITES` array at the top of the script). The Reptyle adapter carries exactly the v7 selectors, so Reptyle behaves as before, with three deliberate changes: both add-URL buttons now ask for confirmation before writing to Stash; performers also match by alias; and the Stash scene lookup pages through all scenes of the site instead of stopping at 500. The `@name` and `@namespace` stay the same so Tampermonkey updates the installed v7 script in place.

**v7.0.0** is the first release in its own repository. The code was supplied as a Sider code-agent preview (`siderRuntime`), not as a Tampermonkey script, and was ported: `fetch` to Stash became `GM_xmlhttpRequest` with `@connect localhost`; the Sider-only `@bound-url`/`@changelog` headers were dropped; `@match` was widened from `/models` and `/models/*` to the whole site because Reptyle is a single-page app and a narrow match never runs when you arrive from another page (the script already ignores other paths).

Original v7 behavior: also mark in-Stash video titles green with a checkmark.

## Install

1. In Chrome/Edge, turn on **Allow User Scripts** for Tampermonkey (extension details → right-click the icon → Manage extension), otherwise no userscript runs.
2. Open the [raw userscript on `master`](https://raw.githubusercontent.com/Morrison65/reptyle-stash-model-link/master/reptyle-stash-model-link.user.js); Tampermonkey shows its install page, click **Install** (or **Update** over an earlier version).
3. Reload the Reptyle tab. When Tampermonkey asks about cross-origin requests, review the `@connect` entries below and choose **Always allow**.

Runs only on the hosts of its adapters, currently `https://app.reptyle.com/*` (top frame only).

## Updates

Since **v8.0.1** the script carries `@updateURL`/`@downloadURL` pointing at the raw file on `master`. Tampermonkey checks that URL on its update interval (default daily; **Utilities → Check for userscript updates** or the script's *Last updated* column forces it) and installs a pushed version when its `@version` is higher. A push without a version bump is not picked up, so `npm run check` and CI refuse a changed userscript whose `@version` is not higher than on `origin/master` (`tools/check-version-bump.cjs`). A copy imported from a file before v8.0.1 has no update URL; install it once from the link above.

## What it does

- **Model page** (`/models/<id>`): a panel under the name. If a performer with exactly that name exists in Stash the name turns green with a checkbox and the panel shows **View in Stash**; if the page URL is not saved on the performer, **Add this URL in Stash** appends it after a confirmation (a `performerUpdate` mutation, the only write the script makes). Names match the performer's name or one of its aliases. Otherwise it lists the closest fuzzy matches. A **Retry** button appears when Stash is unreachable.
- **Videos on a model page** (Reptyle: `.movies-thumb-entry`): titles already in Stash (matched by the site's scene id in a stored URL, or by normalised title among the performer's scenes) are marked green with a check and an "in Stash" badge, and the panel counts them.
- **Model listing** (Reptyle: `/models`): every model that exists in Stash gets an `IN STASH` badge, and a `+ URL` button (with confirmation) when its page URL is not saved yet.
- Re-checks every two seconds, so in-app navigation and infinite scrolling are followed.

## Adding a site

Add an object to `SITES` and an `@match https://<host>/*` per host (a test checks that both agree). The fields are commented at the top of the script: page path patterns for model detail and listing pages, CSS selectors for the name, video cards and model cards, the hosts whose URLs Stash stores for that site's scenes (`sceneHosts`), and `sceneKey`/`modelKey`, which reduce a URL to the id or slug that the site's links and the URLs in Stash have in common. Members areas often use other hosts than the public URLs the Stash scrapers save, which is why the key, not the full URL, is compared. The URL patterns in the Stash community scrapers (`stash/config`, `scrapers/community/`) show which hosts and paths each network uses.
## Permissions

- `@connect localhost`: GraphQL calls to `http://localhost:9999/graphql`. Tampermonkey asks once; choose **Always allow**. If your Stash runs elsewhere, change `STASH_ORIGIN` and add a matching `@connect`.
- `@grant GM_xmlhttpRequest` only.

## Checks

```bash
npm run check      # lint (Tampermonkey 5.5.1 rule set) + unit tests
```

`npm run lint` needs desktop Chrome with Tampermonkey 5.5.1 installed (set `TAMPERMONKEY_EXTENSION_DIR` to override); `npm run check:ci` uses the pinned stand-in after `npm ci --prefix tools/lint-ci`. Unit tests cover metadata/grant consistency, adapter completeness and host selection, the `@match`/adapter agreement and the pure helpers. The DOM behavior was only smoke-tested once in headless Chrome with stubbed Tampermonkey APIs and a stub page; that harness is not part of the repository.
