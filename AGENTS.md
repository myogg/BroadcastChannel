# Repository Guide for Coding Agents

## Sources

- Treat this file as the maintained repo guide. `CLAUDE.md` is a shorter, standalone Claude Code guide that defers to this file for detail.
- No repo-local `opencode.json`, `.opencode/`, `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` is present.
- For any visible UI/design change, read `DESIGN.md` first; implementation tokens live in `src/styles/app/**` and `src/styles/content/**`.
- Theme provenance and third-party acknowledgements are maintained in `NOTICE.md`.

## Theme provenance

- Base is the default Bear-compatible theme; bundled optional overrides live under `public/themes/`.
- Every newly bundled theme must add or update its own `NOTICE.md` entry in the same change, including the upstream project URL, author or copyright holder, license and license URL, and whether the implementation is inspired by or adapted from the upstream work.
- Also update the README theme credits when a bundled theme is added or its provenance changes.
- Do not copy upstream theme code unless its license compatibility and notice requirements have been reviewed. Distinguish visual inspiration from source adaptation accurately.

## Stack and commands

- Runtime/tooling: Node `v22`, `pnpm@11.13.0` (see the note on the local `pnpm` breakage below), Astro `^7.0.9` SSR, Tailwind CSS v4 via `@tailwindcss/vite`, ESLint `^10.7.0` with Antfu + Astro + formatter rules.
- Install/dev/build: `pnpm install`, `pnpm dev` or `pnpm start` (`astro dev`), `pnpm build`, `pnpm preview`.
- Cloudflare Workers build: `SERVER_ADAPTER=cloudflare node_modules/.bin/astro build && npx wrangler deploy --config dist/server/wrangler.json`. `wrangler deploy` uploads a new version but may not auto-activate it; confirm with `npx wrangler deployments list --config dist/server/wrangler.json` and read the **last** entry, which is the newest and must show `(100%)` traffic. Both commands intermittently fail with a Cloudflare API `503`/connection reset — retry once before troubleshooting.
- Skip git hooks when committing: `SKIP_SIMPLE_GIT_HOOKS=1 git commit` or `git commit --no-verify`. The pre-commit hook runs `lint-staged` which may fail if `pnpm` scripts aren't resolving (known issue with `packages field missing or empty`).
- Local checks: `pnpm lint`, `pnpm typecheck`, and `pnpm test`; use `pnpm lint:fix` for auto-fix, `npx eslint <path>` for focused lint, and `pnpm vitest run <test-file>` for a focused test.
- `pnpm` itself may be unusable on a given machine (observed: every `pnpm <script>` and even `pnpm --version` failing with `packages field missing or empty`). Call `node_modules/.bin/<tool>` directly instead; that path always works.
- No outbound network access to `telegram.dog` or `*.workers.dev` from some environments (observed: `astro dev` raising `FetchError ... TimeoutError` on every page, and `curl` against the deployed worker returning `HTTP 000`). Every page calls `getChannelInfo()` at request time, so under that condition you cannot render the app or inspect the live site locally — verify via lint/typecheck/tests/build, and confirm route, redirect, and asset changes by grepping the built manifest at `dist/server/chunks/entrypoints_*.mjs`, where they are all serialized.
- `astro dev` runs detached when started this way; its output does not go to the invoking shell. Use `astro dev logs [--follow]`, `astro dev status`, and `astro dev stop`.
- `postinstall` installs `simple-git-hooks` when `.git` exists; pre-commit runs `lint-staged` with `eslint --fix`.
- CI does not validate app behavior: `docker.yml` only builds/pushes the GHCR image, and `sync.yml` only syncs forks from upstream (`miantiao-me/BroadcastChannel`).

## Validation shortcuts

- Small code change: `npx eslint <changed-file>`, `pnpm typecheck`, and `pnpm test`; run `pnpm lint` if scope widened.
- UI or route change: `pnpm lint`, `pnpm build`, then preview/manual check.
- Feed/SEO/sitemap changes: manually verify `/rss.xml`, `/rss.json`, `/sitemap.xml`, and relevant canonical/meta output in preview.
- Telegram parsing or proxy changes: verify home, one `/posts/[id]` page, RSS output, and a `/static/...` asset path.
- Build config or adapter changes must finish with `pnpm build`.

## Architecture notes

- `src/pages/` contains Astro pages and API-style routes; `src/pages/index.astro` is intentionally thin and calls `getChannelInfo()`. Pagination routes are `/before/[cursor]` and `/after/[cursor]`. Content pages: `/about` (requires `LINKS` env; `/links` redirects here), `/tags` (requires `TAGS` env), `/archive` (always available). Search: `/search/result` (SSR page) and `/search/[q]` (API). Feeds/sitemap: `/rss.xml`, `/rss.json`, `/sitemap.xml`, `/sitemap/[cursor].xml`. Other API routes: `/static/[...url]` (proxy), `/rules/prefetch.json`, `/site.webmanifest`.
- There are two page patterns: **Feed pages** (`index`, `before/[cursor]`, `after/[cursor]`, `search/result`, `posts/[id]`) delegate to `PostsPage.astro` which wraps `BaseLayout` and renders `PostEntry` components. **Standalone pages** (`about`, `tags`, `archive`) wrap `BaseLayout` directly with custom slot content.
- `src/layouts/BaseLayout.astro` wires global CSS, `astro-seo`, the site header/navigation, the right sidebar (`SiteSidebar` with search form and tag cloud), RSS links, `HEADER_INJECT`, and `FOOTER_INJECT`.
- Tag extraction happens in `src/lib/telegram/parse.ts` via `rewriteTagLinksAndCollectTags`: it processes Telegram-generated `<a href="?q=...">` tag links, rewrites them to `/search/result?q=...`, and strips `#` from the link text. Tags are stored on each `Post.tags` and aggregated into the sidebar tag cloud in `BaseLayout.astro` (every tag, sorted by frequency; font-size 0.65em–1.5em and colour are scaled against the full count range, so the thresholds shift as the tag set grows). All tag links use the convention `/search/result?q=%23<tag>` (via `getTagHref` in `src/lib/post-ui.ts`). Only Telegram-generated tag links are used as tag sources; plain-text `#hashtag` patterns in the post body are NOT regex-matched to avoid false positives from non-tag `#` characters.
- `src/middleware.ts` sets `SITE_URL`/`RSS_URL` locals, handles legacy `#tag` search rewrites, and adds speculation/cache headers.
- Telegram fetching/parsing belongs in `src/lib/telegram/**`; request caching uses `ocache` with 5 min max age and `swr: false` (SWR disabled because detached refresh has no Cloudflare `waitUntil` context). `getChannelInfo()` returns one page of posts and accepts `before`/`after` cursors and `q` search — no date-range filtering.
- Shared env helpers are in `src/lib/env.ts`; runtime `process.env` wins over build-time `import.meta.env`, and they do not read `Astro.locals.runtime.env`.
- Static proxy logic is shared in `src/lib/static-proxy.ts`; both Astro route `src/pages/static/[...url].ts` and Vercel Edge Function `api/static/index.ts` use it, with `/static/:path*` rewritten by `vercel.json`.
- Do not broaden the static proxy target whitelist unless the task explicitly changes the security model.
- Keep shared domain interfaces in `src/types.ts`; there are no TS path aliases, so use relative imports.
- Body classes scope page-level CSS: `body.feed` for home/pagination/search feeds, `body.post` for post detail, `body.page` for standalone pages (archive, about, tags). Use `body.feed` selectors to apply feed-only rules. All first-party component CSS lives in `@layer components`; theme override stylesheets are unlayered and cascade over them.
- Post date formatting is in `src/lib/post-ui.ts` (`formatPostTime`); `groupByYearMonth` is also there for archive grouping. Navigation items are computed in `src/lib/seo.ts` (`getPageSeo`) and threaded through `BaseLayout` to `SiteNavigation`.
- TTS (text-to-speech) is implemented in `PostEntry.astro` as an `is:inline` script scoped per-post via `document.currentScript.closest('.post-entry')`. It calls `tts.134688.xyz` API with `zh-CN-XiaoxiaoNeural` voice, chunks text at sentence boundaries (300-char max), and plays via HTML5 `Audio`. The listen button appears on any post with `hasContent`, not just detail pages.
- Language detection for the TTS label is computed server-side in `PostEntry.astro` frontmatter: if the CJK character ratio in `post.text` is below 30%, the button reads "Listen"; otherwise "听全文". The TTS voice remains `zh-CN-XiaoxiaoNeural` for both languages. Playing state shows "播放中…" (or "Playing…" for English) with a pulsing `.is-playing` CSS class on the button.
- `isRenderablePost()` in `src/lib/telegram/index.ts` requires `post.text.trim() || post.title.trim()` in addition to `post.id`, `post.type === 'text'`, and `post.content`. Posts with empty text and empty title are filtered out even if `content` HTML is non-empty (e.g., media-only posts with no text).
- Tag validation in `src/lib/telegram/parse.ts` (`isValidTag()`) filters out pure-numeric tags and tags exceeding 10 characters, preventing data artifacts like "7" or concatenated title-fragments from appearing in the tag cloud.
- The archive page (`src/pages/archive.astro`) paginates through all older posts by looping `getChannelInfo({ before: cursor })` until no more posts remain, so the full archive is rendered on a single page without pagination controls.
- The image lightbox in `PostEntry.astro` uses a shared Popover API container (`div.lightbox[popover="auto"]`) per post with a track/slide structure for swipe navigation. `images.ts` generates `data-lightbox`/`data-index` attributes on preview buttons and the lightbox HTML; the JS handles open/close, prev/next buttons, keyboard arrows, touch swipe, and swipe-down-to-close. The `sanitize.ts` attribute whitelist includes `data-lightbox` and `data-index` on `<button>`; the feed sanitizer strips `modal-img` class images from RSS/JSON output.
- Post titles are extracted in `parse.ts` via `TITLE_PREVIEW_REGEX` from the first line of content text (up to the first `。`, newline, or URL), then truncated to 80 characters. Since Telegram non-premium channels cannot intersperse text and images, all images appear before the text body in the rendered content.

## Env and deployment gotchas

- `CHANNEL` is required server-side; missing it throws during Telegram fetch.
- `TELEGRAM_HOST` defaults in code to `telegram.me`; `.env.example` uses `telegram.dog` as an override example.
- `STATIC_PROXY` defaults to `/static/` only when unset; set it to an empty string for direct Telegram asset URLs.
- `astro.config.mjs` selects adapters for Vercel, Cloudflare Workers, Netlify, Node standalone, and EdgeOne; `SERVER_ADAPTER` overrides auto-detection, and Cloudflare Pages is explicitly rejected. The `cloudflare` adapter name aliases to `cloudflare_workers`; unknown providers fall back to `node`.
- EdgeOne is detected from std-env's `edgeone_pages` provider or platform-provided `EDGEONE_PROJECT_ID`/`EO_MAKERS`; `DOCKER=true` or EdgeOne detection sets Vite SSR `noExternal: true`.
- `GOOGLE_SEARCH_SITE` env routes sidebar search to Google site search instead of the internal `/search/result` endpoint.
- If env behavior changes, update `.env.example` and README docs together.

## Code and content conventions

- Server-rendered HTML is the default; keep browser JS near zero. Telegram comments, TTS, and the image lightbox are the deliberate exceptions (all use `is:inline` scripts scoped per-post via `document.currentScript.closest('.post-entry')`).
- When adding `is:inline` scripts to `PostEntry.astro`, place them inside the same `{hasContent && (<>...</>)}` block as the existing TTS script. Astro's compiler fails on multiple adjacent `{...}` blocks each containing `is:inline` scripts — use a single `<>...</>` fragment wrapper.
- API-style routes must return `Response`/`Response.json`, not Express-like objects.
- Follow ESLint formatting: 2 spaces, LF, UTF-8, single quotes, usually no semicolons; let `pnpm lint:fix` settle import order.
- Preserve local naming: Astro components and layouts use `PascalCase.astro`; pages follow Astro route syntax.
- External Telegram HTML must be sanitized via `src/lib/sanitize.ts` before `set:html`; config injections in `BaseLayout.astro` are the only intentional raw HTML path.
- Design changes should preserve the content-first Base contract from `DESIGN.md`; Sepia is an optional warm-paper override, not the default. Avoid card-heavy redesigns unless explicitly requested.

## Cloned Dependency Source

Read-only dependency source repositories are available under
`.slim/clonedeps/repos/` for inspection. Do not edit these clones.

- `.slim/clonedeps/repos/HermanMartinus__bearblog/` - `HermanMartinus/bearblog` at `a6cf650886d11461dd1839d02020ca0aee0fee67`; reference for the visitor DOM and default Bear theme contract.
- `.slim/clonedeps/repos/panr__hugo-theme-terminal/` - `panr/hugo-theme-terminal` at `4acd067c48195ac503541ba75f9259c7158d3792`; reference for Terminal CSS and template structure.
- `.slim/clonedeps/repos/miantiao-me__astro-aria/` - `miantiao-me/astro-aria` at `15c6eb8143ac55f9ba8d925b43f973ceef046980`; reference for Aria styling and Astro component composition.
