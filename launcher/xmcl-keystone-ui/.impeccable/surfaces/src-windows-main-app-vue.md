---
version: 1
slug: "src-windows-main-app-vue"
primary_target: "src/windows/main/App.vue"
related_targets: ["src/views/LauncherNavigation.vue","src/views/LauncherLibrary.vue","src/views/LauncherAccounts.vue","src/views/HomeHeader.vue","src/views/HomeFocusFooterV2.vue","src/views/StoreEntry.vue","src/views/Setting.vue","src/assets/common.css"]
---

# Surface Brief — Launcher MC Desktop Shell & Core Views

## Scope & Mode
- **Primary Target:** `src/windows/main/App.vue`
- **Related Targets:** `src/views/LauncherNavigation.vue`, `src/views/LauncherLibrary.vue`, `src/views/LauncherAccounts.vue`, `src/views/HomeHeader.vue`, `src/views/Home.vue`, `src/views/HomeFocusFooterV2.vue`, `src/views/StoreEntry.vue`, `src/views/Setting.vue`, `src/views/SettingAbout.vue`, `src/views/SettingUpdate.vue`, `src/views/Setup.vue`, `src/assets/common.css`
- **Mode:** `operate`

## Direction contract

THESIS: Launcher MC is a tactile, distraction-free game workshop and shelf built like a precision field manual and physical cartridge rack—refusing the AI-slop template of glowing neon dots, uppercase eyebrow kickers above every heading, nested cards-inside-cards, and uncalibrated blur.

OWN-WORLD: Deep obsidian-slate workshop ground (`#0c0e12`) paired with a warm graphite rail (`#12151c`), warm mineral ivory typography (`#f3f1ec`), muted stone secondary ink (`#9ca3af`), and a purposeful mineral palette: Terracotta/Copper (`#e06d53`) as the primary launch/action colour, Moss Jade (`#3b9b78`) for verified/online states and Vanilla/Fabric readiness, and Ochre Amber (`#d4943a`) for Forge/NeoForge and warnings. Surfaces use crisp 1px structural hairlines (`rgba(243, 241, 236, 0.08)`) OR single-elevation offset shadows (`0 10px 24px -6px rgba(0, 0, 0, 0.5)`), never both on the same element, and zero nested cards.

STORY: A Spanish-speaking player opens Launcher MC and immediately sees their active instance ready to launch at the bottom-right and their library organized as a clean shelf with a live detail strip—switching profiles or launching in one click, while modders can expand instance content, console logs, and JVM parameters without visual clutter.

FIRST VIEWPORT: Left structural rail (`232px`, solid `#12151c` with a 1px right rule, no floating margin or neon halo) holding the brand mark, four primary destinations, an inline active-instance status block with sub-routes, and the bottom account bar. Main workspace uses a clean top bar, direct headings without eyebrow kickers, a horizontal filter/search toolbar, and a structured instance shelf where the active row/tile expands on focus with smooth exponential ease-out (`cubic-bezier(0.22, 1, 0.36, 1)`).

FORM: Candidate 3 (Cartridge Workshop & Field Shelf, raised by `pop-culture-shelf-streaming-title-card-wall` for focus-driven tile lift/dimming and `rw-centre-rail-reference-setting` for 1px hairline rule discipline instead of nested card boxes); `seed:e32f593ad65f7ae0`

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
