# Product

## Platform

Electron desktop for Windows 10/11 x64. React renderer in parallel with the existing Vue app until validated. Main window 1200×720, minimum 800×400. Main/logger/migration only; no launcher-browser window in the new product.

## Users and purpose

Spanish-speaking Minecraft Java players. Open, continue an instance and play; manage isolated versions/loaders/mods/packs/shaders/worlds and discover public CurseForge/Modrinth content. Advanced Java/RAM/arguments remain available without crowding the first view.

## Authoritative scope

Read ../../docs/react-migration/PLAN.md, SCOPE.md, PARITY.md and state.json from repository root. User confirmed only Java core, without XMCL extras: remove AI, Bedrock, P2P/social/voice, SSH/server administration, publishing, launcher browser, gamepad/Big Picture, old theme editor/background engine/audio and XMCL telemetry. Preserve old data inert. Ordinary Minecraft servers remain usable. Microsoft configuration is deferred.

## Confirmed design

Xbox/Epic quality and spatial familiarity with an owned identity. Left navigation. Continue-and-play home. Media correction: use each modpack's own resources from its metadata, without manually searching for replacement pack art. Search internet for real Vanilla/fallback imagery/videos, preferably rendered with shaders, with documented permission; no AI artwork or running shaders in the launcher. Rotate featured instance/media and pause on interaction. Fixed light/dark/system. No bubbles, editable themes or arbitrary CSS/background settings.

Visual correction from the user on 2026-10-24: the landscape must also fill the whole window, with glassmorphism on the frame and panels. Preserve obsidian/copper, legibility, opaque fallback and a performance mode without blur. The prototype background follows the featured instance on Home and the selected instance on other routes; its video remains confined to the featured area. This replaces the earlier purely tonal material direction. The user subsequently approved this prototype on 2026-10-24; see ../../docs/react-migration/DESIGN_APPROVAL.json. Functional migration remains pending.

## Brand and evidence

Grimo Launcher is the definitive name, confirmed by the user on 2026-10-25. Use the supplied assets in ../branding without altering the approved Obsidian/Copper surfaces. Preserve legacy storage, appId, protocol and update repository identities for compatibility, and all legal attribution. No fabricated user counts, testimonials, endorsements or claims. Prototype stage uses clearly labelled fictional fixture instances, no real installs or launch side effects. Existing beta.2 screenshots are reference/anti-reference in e2e/artifacts/react-migration-baseline-visual.

## Quality and acceptance

Keyboard/focus/AA contrast, reduced motion, visible error/loading/empty states. One active video, posters/fallbacks, native focus/minimize/game/performance pauses. Keep public update links and Cloudflare secret boundary. Stage 1 visual review by the human precedes extending the design. No production cutover before stage 8.
