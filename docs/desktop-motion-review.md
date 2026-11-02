# Desktop motion review

Based on PR #4 (`design/praevu-inspired-desktop-dashboard`), commit `02aeadf`.

## Behavior

- Three fixed decorative layers: navy depth, architectural grid and soft gold light. Scroll updates are coalesced into one animation frame, with bounded displacement and no React state updates.
- Desktop only (1051px and wider). Mobile retains the existing presentation; it installs no scroll listener or reveal observer.
- One-time reveal applies to headings and small cards. Chart surfaces, navigation, anchor containers and the dashboard shell are never transformed.
- Reduced-motion preference disables parallax, reveals, smooth scrolling and transitions. Runtime preference/breakpoint changes clean up observers, listeners, pending frames and hidden classes. Focus makes a pending card immediately visible.
- No animation libraries, image assets, data/API/authentication changes or production deployment.

## Verification

- Next.js production build completed, including type validation and all 18 static pages. Existing global stylesheet autoprefixer warnings about `start`/`end` remain.
- All 51 existing tests passed. Three new behavioral tests passed for distinct layer movement, reveal/cleanup, mobile/reduced-motion gating and live preference changes.
- Browser QA at 1440×1000 and 1280×900: no horizontal document overflow.
- At scrollY 3068.8, layer translations were -91.77px, -213.04px and -327.76px. Navigation remained at top 0; chart transform remained `none`.
- Clicking 個股分析 reached `#charts`, with section top 120.28px below navigation bottom 85.6px.
- At 390×844: document width 390px, atmosphere display `none`, no inline layer transforms and no pending reveals.
- Live remote data availability and signed-in member content were not acceptance-tested; screenshots show the real logged-out/loading/unavailable states without fabricated quotes.
- Reduced-motion behavior was verified by the behavioral harness and stylesheet review, rather than OS-level browser emulation.

## Screenshots

![Desktop](previews/desktop-1440.jpg)
![Chart anchor](previews/desktop-charts.jpg)
![Mobile](previews/mobile-390.jpg)

For local review, run the usual development server and scroll the document, including the side gutters and spaces between panels. The news feed has its own inner scrolling area; scrolling that area intentionally does not move the page background.
