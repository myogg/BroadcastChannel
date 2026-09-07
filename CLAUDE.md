# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A server-rendered Astro app that mirrors a public Telegram channel. At request time it scrapes the channel's web-preview HTML, parses it with cheerio, transforms it into the site's own markup, sanitizes it, and serves it as a blog-style feed with RSS/JSON feeds, search, archive, tags, and a media proxy.

## Commands

```bash
pnpm install
pnpm dev          # or `pnpm start` → astro dev
pnpm build        # astro build
pnpm preview      # astro preview

pnpm lint         # eslint .
pnpm lint:fix     # eslint . --fix
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm test:watch   # vitest

# single test / focused lint
pnpm vitest run src/lib/feed.test.ts
npx eslint src/lib/feed.ts

# Cloudflare Workers build + deploy
SERVER_ADAPTER=cloudflare_workers node_modules/.bin/astro build
node_modules/.bin/wrangler deploy --config dist/server/wrangler.json
```

### Local environment gotchas

- `pnpm` on this machine fails with `packages field missing or empty`; use `node_modules/.bin/<tool>` directly. The pre-commit hook (`simple-git-hooks` → `pnpm lint-staged`) fails for the same reason — commit with `git commit --no-verify` and run `npx eslint --fix <files>` manually first.
- `git push` over HTTPS is connection-reset on this network; `origin` is set to SSH, which works.
- `wrangler deploy` uploads a new version but may not auto-activate it; confirm with `wrangler deployments list` (latest version should show 100% traffic).

## Architecture

The request path is a pipeline: **fetch → parse → sanitize → render**.

- `src/lib/telegram/request.ts` — fetches `https://<host>/s/<channel>` (or `?embed=1&mode=tme` for a single post), cached via `ocache` (5 min, `swr: false`).
- `src/lib/telegram/index.ts` — `getChannelInfo()` (one page, accepts `before`/`after`/`q`), `getChannelPost()`, and `getAllTags()` (paginated full-history tag counts, cached).
- `src/lib/telegram/parse.ts` + `content.ts` — turn the cheerio DOM into a `Post` (title, tags, content HTML, reactions). Handles code highlighting (Prism), tag-link rewriting, and media URL proxying.
- `src/lib/telegram/media/*` — images (lightbox HTML), video/audio, stickers, link previews, replies/forwards.
- `src/lib/sanitize.ts` — `sanitizeContentHtml` / `sanitizeFeedHtml` whitelist. All external Telegram HTML must pass through this before `set:html`.
- `src/lib/static-proxy.ts` — SSRF-guarded media proxy (domain whitelist), shared by the Astro route `src/pages/static/[...url].ts` and the Vercel edge function `api/static/index.ts`.
- `src/lib/env.ts` — env helper where runtime `process.env` wins over build-time `import.meta.env`.
- `src/types.ts` — shared domain types. No TS path aliases; use relative imports.

Two page patterns (see `src/pages/`):

- **Feed pages** (`index`, `before/[cursor]`, `after/[cursor]`, `search/result`, `posts/[id]`) delegate to `PostsPage.astro`, which wraps `BaseLayout` and renders `PostEntry` components.
- **Standalone pages** (`links`, `tags`, `archive`) wrap `BaseLayout.astro` directly.

`src/middleware.ts` sets `SITE_URL`/`RSS_URL` locals and caching/speculation headers. Browser JS is intentionally near-zero; Telegram comments, TTS, and the image lightbox are the deliberate `is:inline` exceptions.

## Env and adapters

`CHANNEL` is required. Other keys: `TELEGRAM_HOST`, `STATIC_PROXY`, `TARGET_WHITELIST`, `TAGS`, `LINKS`, `NAVS`, `GOOGLE_SEARCH_SITE`, `REACTIONS`, `COMMENTS`, `HEADER_INJECT`/`FOOTER_INJECT`. Update `.env.example` and README together when env behavior changes.

`astro.config.mjs` selects the adapter from `SERVER_ADAPTER` (or `std-env`'s `provider`); Cloudflare Pages is rejected, and unknown providers fall back to `node`. Adapters: Cloudflare Workers, Netlify, Vercel, Node standalone, EdgeOne.

## Reference

- `AGENTS.md` — the maintained, detailed repo guide (parsing pipeline, design conventions, theme provenance, validation shortcuts). Treat it as authoritative.
- `DESIGN.md` — the design-system contract (Base theme + optional overrides); read before UI changes.
- `README.md` / `README.zh-cn.md` — features and deployment tutorials.
