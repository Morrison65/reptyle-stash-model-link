# reptyle-stash-model-link

Tampermonkey userscript for **desktop Chrome** that links Reptyle model pages to the matching performer in your local [Stash](https://stashapp.cc) (`http://localhost:9999`). Version **7.0.0**.

**v7.0.0** is the first release in its own repository. The code was supplied as a Sider code-agent preview (`siderRuntime`), not as a Tampermonkey script, and was ported: `fetch` to Stash became `GM_xmlhttpRequest` with `@connect localhost`; the Sider-only `@bound-url`/`@changelog` headers were dropped; `@match` was widened from `/models` and `/models/*` to the whole site because Reptyle is a single-page app and a narrow match never runs when you arrive from another page (the script already ignores other paths).

Original v7 behavior: also mark in-Stash video titles green with a checkmark.

## Install

1. In Chrome/Edge, turn on **Allow User Scripts** for Tampermonkey (extension details → right-click the icon → Manage extension), otherwise no userscript runs.
2. Open Tampermonkey's dashboard → **Utilities → Import from file** and select [`reptyle-stash-model-link.user.js`](reptyle-stash-model-link.user.js). Alternatively create a new script and replace its contents with this file, including the metadata header.
3. Reload the Reptyle tab. When Tampermonkey asks about cross-origin requests, review the `@connect` entries below and choose **Always allow**.

Runs on `https://app.reptyle.com/*` (top frame only).

## What it does

- **Model page** (`/models/<id>`): a panel under the name. If a performer with exactly that name exists in Stash the name turns green with a checkbox and the panel shows **View in Stash**; if the page URL is not saved on the performer, **Add this URL in Stash** appends it (a `performerUpdate` mutation, the only write the script makes). Otherwise it lists the closest fuzzy matches. A **Retry** button appears when Stash is unreachable.
- **Videos on a model page** (`.movies-thumb-entry`): titles already in Stash (matched by Reptyle URL or normalised title) are marked green with a check and an "in Stash" badge, and the panel counts them.
- **Model listing** (`/models`): every model that exists in Stash gets an `IN STASH` badge, and a `+ URL` button when its Reptyle URL is not saved yet.
- Re-checks every two seconds, so in-app navigation and infinite scrolling are followed.

## Permissions

- `@connect localhost`: GraphQL calls to `http://localhost:9999/graphql`. Tampermonkey asks once; choose **Always allow**. If your Stash runs elsewhere, change `STASH_ORIGIN` and add a matching `@connect`.
- `@grant GM_xmlhttpRequest` only.

## Checks

```bash
npm run check      # lint (Tampermonkey 5.5.1 rule set) + unit tests
```

`npm run lint` needs desktop Chrome with Tampermonkey 5.5.1 installed (set `TAMPERMONKEY_EXTENSION_DIR` to override); `npm run check:ci` uses the pinned stand-in after `npm ci --prefix tools/lint-ci`. Unit tests cover metadata/grant consistency and the pure helpers. The DOM behavior was only smoke-tested once in headless Chrome with stubbed Tampermonkey APIs and a stub page; that harness is not part of the repository.
