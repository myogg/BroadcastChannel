# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A server-rendered Astro app that mirrors a public Telegram channel. At request time it scrapes the channel's web-preview HTML, parses it with cheerio, transforms it into the site's own markup, sanitizes it, and serves it as a blog-style feed with RSS/JSON feeds, search, archive, tags, and a media proxy. Everything is SSR (`output: 'server'`) — no page is prerendered.

## Commands

`pnpm` does not work on this machine (see gotchas), so call binaries out of `node_modules/` directly:

```bash
node_modules/.bin/astro dev        # detached; see the dev-server gotcha below
node_modules/.bin/astro build
node_modules/.bin/astro preview
node_modules/.bin/eslint .         # add --fix to autofix
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run       # omit `run` to watch

# single test / focused lint
node_modules/.bin/vitest run src/lib/feed.test.ts
npx eslint src/lib/feed.ts

# Cloudflare Workers build + deploy
SERVER_ADAPTER=cloudflare_workers node_modules/.bin/astro build
node_modules/.bin/wrangler deploy --config dist/server/wrangler.json
node_modules/.bin/wrangler deployments list --config dist/server/wrangler.json
```

### Local environment gotchas

- **`pnpm` is broken here.** Every `pnpm <script>`, including `pnpm --version`, fails with `packages field missing or empty`. Use `node_modules/.bin/<tool>`. The pre-commit hook (`simple-git-hooks` → `pnpm lint-staged`) fails for the same reason, so run `npx eslint --fix <files>` yourself and commit with `git commit --no-verify`.
- **Nothing here can reach `telegram.dog` or `*.workers.dev`.** `astro dev` dies with `FetchError ... TimeoutError` on every page, and `curl` against the deployed worker returns `HTTP 000`. Because every page calls `getChannelInfo()` at request time, you cannot render the app or inspect the live site locally. Verify with lint/typecheck/vitest/build instead, and grep the built manifest at `dist/server/chunks/entrypoints_*.mjs` — routes, redirects, and emitted assets are all serialized there, which is how to confirm routing or asset changes. State plainly which visual outcome went unverified rather than implying you saw it.
- **`astro dev` runs detached.** Its output does not reach your shell; use `astro dev logs [--follow]`, `astro dev status`, and `astro dev stop`.
- **`wrangler deploy` can upload without activating.** Confirm with `wrangler deployments list` and read the **last** entry — newest prints at the bottom, and its version must show `(100%)` traffic. Both `deploy` and `deployments list` intermittently fail with a Cloudflare API `503` or connection reset; retry once before digging in.
- `git push` over HTTPS is connection-reset on this network; `origin` is set to SSH, which works.
- CI validates nothing about app behavior: `docker.yml` only builds/pushes the GHCR image and `sync.yml` only syncs forks from upstream.

## Architecture

The request path is a pipeline: **fetch → parse → sanitize → render**.

- `src/lib/telegram/request.ts` — fetches `https://<host>/s/<channel>` (or `?embed=1&mode=tme` for a single post), cached via `ocache` (5 min, `swr: false`; SWR is off because there is no Cloudflare `waitUntil` context).
- `src/lib/telegram/index.ts` — `getChannelInfo()` (one page, accepts `before`/`after`/`q`), `getChannelPost()`, and `getAllTags()` (paginated full-history tag counts, cached).
- `src/lib/telegram/parse.ts` + `content.ts` — turn the cheerio DOM into a `Post` (title, tags, content HTML, reactions). Handles code highlighting (Prism), tag-link rewriting, and media URL proxying.
- `src/lib/telegram/media/*` — images (lightbox HTML), video/audio, stickers, link previews, replies/forwards.
- `src/lib/sanitize.ts` — `sanitizeContentHtml` / `sanitizeFeedHtml` whitelist. All external Telegram HTML must pass through this before `set:html`.
- `src/lib/static-proxy.ts` — SSRF-guarded media proxy (domain whitelist), shared by the Astro route `src/pages/static/[...url].ts` and the Vercel edge function `api/static/index.ts`. Do not widen the whitelist unless the task is explicitly about changing that security model.
- `src/lib/env.ts` — env helper where runtime `process.env` wins over build-time `import.meta.env` (it does not read `Astro.locals.runtime.env`).
- `src/types.ts` — shared domain types. No TS path aliases; use relative imports.

Two page patterns (see `src/pages/`):

- **Feed pages** (`index`, `before/[cursor]`, `after/[cursor]`, `search/result`, `posts/[id]`) delegate to `PostsPage.astro`, which wraps `BaseLayout` and renders `PostEntry` components.
- **Standalone pages** (`about`, `tags`, `archive`) wrap `BaseLayout.astro` directly. `/about` also has a `/links` redirect configured in `astro.config.mjs`.

`src/middleware.ts` sets `SITE_URL`/`RSS_URL` locals, rewrites legacy `#tag` searches, and sets caching/speculation headers. Browser JS is intentionally near-zero; Telegram comments, TTS, and the image lightbox are the deliberate `is:inline` exceptions, scoped per post via `document.currentScript.closest('.post-entry')`.

## Env and adapters

`CHANNEL` is required. Other keys include `TELEGRAM_HOST`, `STATIC_PROXY`, `TARGET_WHITELIST`, `TAGS`, `LINKS`, `NAVS`, `COMMENTS`, `REACTIONS`, `LOCALE`, `TIMEZONE`, the social/header keys, and `HEADER_INJECT`/`FOOTER_INJECT`; `.env.example` is the full list. Update `.env.example` and README together when env behavior changes.

`astro.config.mjs` selects the adapter from `SERVER_ADAPTER` (or `std-env`'s `provider`); `cloudflare` aliases to `cloudflare_workers`, Cloudflare Pages is explicitly rejected, and unknown providers fall back to `node`. Adapters: Cloudflare Workers, Netlify, Vercel, Node standalone, EdgeOne.

## Reference

- `AGENTS.md` — the maintained, detailed repo guide (parsing pipeline, per-feature notes, validation shortcuts, theme provenance). Treat it as authoritative when this file and it disagree.
- `DESIGN.md` — the design-system contract (Base theme + optional overrides); read before UI changes.
- `NOTICE.md` — theme provenance. Adding or changing a bundled theme requires updating it and the README credits in the same change.
- `README.md` / `README.zh-cn.md` — features and deployment tutorials.
