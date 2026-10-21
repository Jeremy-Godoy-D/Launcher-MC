---
name: ui-ux-pro-max
description: Comprehensive desktop application & game launcher UI/UX design system skill. Combines spatial ergonomics, high-contrast gaming telemetry, keyboard/mouse flow optimization, Bento grid hierarchy, and Apple-style Liquid Glass surfaces for Electron/Vue/React desktop apps.
---

# UI/UX Pro Max — Desktop & Game Launcher Design System

Use this skill when designing, refactoring, or auditing desktop applications, game launchers, or creative tools that require both **high-craft visual polish** and **zero-friction utility ergonomics**.

## 1. Core UX Principles for Desktop Launchers

1. **One-Click Primary Action Law**
   - A user opening a game launcher has one primary goal 85% of the time: **launch their active instance** or **switch to another instance and launch**.
   - Never bury the active instance, play button, or profile switcher behind secondary modals or nested tabs.
   - Always keep the **Active Instance Card** and **Active Account Chip** visible in the persistent navigation dock.

2. **Spatial Architecture & 3-Zone Layout**
   - **Zone 1: Persistent Floating Dock (Left Sidebar, `248px`–`260px`)**
     - Brand identity + version badge at top.
     - Primary navigation destinations (`Biblioteca`, `Explorar`, `Cuentas`, `Ajustes`) with clear active pill indicator and subtle glow.
     - Elevated **Active Instance Quick-Card** with direct sub-routes (`Resumen`, `Contenido`, `Ajustes`, `Consola`).
     - Pinned **Account Switcher Footer** showing avatar, username, and authentication mode badge (`LOCAL` / `MICROSOFT`).
   - **Zone 2: Contextual Top Bar & Action Header**
     - Frameless window system bar (`34px`) with minimal chrome and translucent blur.
     - Context header for the current view (e.g., Instance Hero Bar with runtime badges for Minecraft, Loader, and Java, or Library Search & Loader Filter Bar).
   - **Zone 3: Scrollable Bento Canvas**
     - Responsive CSS Grid (`repeat(auto-fill, minmax(280px, 1fr))`) with `16px`–`20px` gap and `24px`–`28px` outer breathing room.

3. **Two-Tier Liquid Glass Hierarchy (Performance + Readability)**
   - **Tier 1 (`.lg-surface`)**: Applied ONLY to primary structural planes (Left Sidebar Dock, Top System/Instance Header, Floating Launch Dock, Modal Dialogs). Uses `backdrop-filter: blur(24px) saturate(180%)` + top specular edge `inset 0 1px 0 rgba(255, 255, 255, 0.16)`.
   - **Tier 2 (`.lg-inset`)**: Applied to cards, instance tiles, setting rows, and chips inside scroll containers. Uses layered translucent fill (`rgba(255, 255, 255, 0.045)`) + subtle border (`rgba(255, 255, 255, 0.09)`) + hover specular lift, **without** nested `backdrop-filter` to guarantee 60fps scrolling.

4. **Semantic Color Coding & Runtime Telemetry**
   - **Primary Accent (Emerald `#10b981`)**: Launch actions, active states, verified runtime badges.
   - **Secondary Accent (Cyan `#06b6d4`)**: Fabric/Modrinth content badges, informational highlights, secondary links.
   - **Warning Accent (Amber `#f59e0b`)**: Forge/NeoForge badges, pending updates, JVM warnings.
   - **Danger Accent (Rose `#f43f5e`)**: Crash diagnostics, destructive delete actions.

5. **Typography & Scannable Micro-Copy**
   - **Display / Hero Titles**: `clamp(1.35rem, 2vw, 1.85rem)`, `font-weight: 700`, `letter-spacing: -0.025em`.
   - **Section Eyebrows**: `0.70rem` (`11.2px`), `font-weight: 700`, ` text-transform: uppercase`, `letter-spacing: 0.11em`, `color: #34d399`.
   - **Tabular Telemetry**: `font-variant-numeric: tabular-nums` on all version numbers, RAM allocations, and counters.

6. **Accessibility & Automated Test Stability**
   - Maintain WCAG AA contrast (`>= 4.5:1`) on all text over translucent surfaces by pairing glass panels with a deep obsidian base (`#080c14` to `#0f172a`).
   - Preserve all `data-testid` hooks on interactive controls so E2E/Playwright/DevTools validation remains 100% deterministic.
