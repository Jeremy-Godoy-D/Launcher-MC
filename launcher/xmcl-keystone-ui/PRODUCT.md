# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Electron desktop app for Windows 10/11 x64; UI is Vue 3 + Vuetify 4 + UnoCSS rendered in Chromium. Frameless window with a custom system bar.)

## Users

Primary: Spanish-speaking Minecraft: Java Edition players on Windows. Casual players come first — they open the launcher to get into the game fast, with either a Microsoft account or a local/offline profile. Secondary, on the same surfaces: modders and modpack players who keep several isolated instances (Vanilla, Fabric, Forge, NeoForge) and spend time on content, Java, memory and JVM settings.

## Product Purpose

A desktop launcher that installs, manages and launches Minecraft Java instances, each fully isolated (own mods, resource packs, shaders, worlds, settings). Success = a casual player reaches "Jugar" in seconds; a modder can install a Modrinth/CurseForge modpack and tune an instance without leaving the app.

## Positioning

All of these together, with more planned (confirmed by owner):
- Entire interface in Spanish, simpler and calmer than Prism-style launchers.
- Local/offline profiles and Microsoft accounts managed side by side in one place.
- One-click Modrinth/CurseForge modpacks and content into isolated instances.
- An owned identity: the owner's own launcher, not a reskinned upstream.

## Operating Context

Used on a desktop/laptop, mouse + keyboard, sometimes gamepad (gamepad prompts and Big Picture mode exist). Typical session: open → pick instance → play; less often: create instance, browse catalog, manage accounts, tweak settings, read console on crash. Window can be small (~1000×640) up to maximized.

## Capabilities and Constraints

- Derived from X Minecraft Launcher (MIT); runtime/services stay as-is. Redesign is renderer-only (`launcher/xmcl-keystone-ui`).
- Routes in scope: Library (`/me`), Instance overview/home (`/`), content (`/mods`, `/resourcepacks`, `/shaderpacks`, `/save`), instance settings (`/base-setting`), Store/catalog (`/store`, project detail pages), Accounts (`/accounts`), Settings (`/setting`), Setup wizard (bootstrap), dialogs (add instance, login, log/console, update, delete, launch blocked, tasks).
- Every existing `data-testid` must survive (nav-*, library-create-instance, instance-card-*, accounts-*, saved-account-*, instance-header-runtime, instance-tab-*, store-search, settings-page, settings-check-update, me-user-switcher, account-item).
- Auto-update via GitHub Releases (public repo Jeremy-Godoy-D/Launcher-MC) must remain reachable from Settings.
- Must run smoothly in Electron on mid-range PCs; heavy backdrop-filter stacking is a known perf risk.

## Brand Commitments

- Product name is provisional ("Launcher MC"); final name and logo are undecided — design must not depend on the wordmark.
- Owner asked for a color recommendation and a single coherent design line across the whole app.
- Owner explicitly rejects anything that "looks AI-made".

## Evidence on Hand

- Current app icon: `launcher/xmcl-electron-app/icons/launchermc.ico` (provisional).
- No testimonials, user counts, or press exist — never fabricate them.

## Product Principles

1. Play is one step away from anywhere.
2. Casual by default, deep on demand: advanced controls exist but never crowd the first view.
3. Spanish first, written like a person, not a template.
4. One design language for every surface, dialog and state.
5. Fast and stable beats flashy: motion must earn its place and never block input.

## Accessibility & Inclusion

Keyboard and gamepad navigation already exist and must keep working (roving tabindex, focus-visible). Respect `prefers-reduced-motion`. Text contrast ≥ WCAG AA on all surfaces.
