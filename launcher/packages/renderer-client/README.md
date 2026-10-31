# Renderer client

Framework independent service calls, shared state snapshots and task monitoring. Electron and DeskGap reuse `transport.ts`; React hooks live in `xmcl-react-ui/src/runtime.tsx`. This package imports no React or Vue runtime.

Create one `RendererClient` per window from the existing `serviceChannels` and `taskMonitor` bridges. Keep it across React Strict Mode effect remounts; dispose it when the window leaves. Rendering or mounting a component must never launch, install, delete or export anything.

- `service(ServiceKey)` caches typed proxies and method identities. Arguments/results keep their original representation; domain results such as `{ ok: false }` are returned unchanged. Handle rejected actions at the feature boundary.
- `state(descriptorKey, StateClass, load)` starts a read only when observed. Include every resource parameter, especially instance path, in the descriptor key. Aliases of the same backend ID/epoch share the mutation handler and snapshot. Never change the class used by a key.
- `getSnapshot()` is stable until an update. Domain mutation methods are applied to a private copy; earlier snapshots remain unchanged. State data follows the existing backend record/array serialization; service call payloads are not JSON serialized by this client. Typed views cannot be frozen by JavaScript and should not be introduced as shared mutable state.
- `subscribe` returns explicit cleanup. The last consumer releases the state after the Strict Mode microtask grace period; late results are released too. `commit` and `revalidate` call the existing bridge and require a ready store.
- Use `listen` / React `useServiceEvent` for owned event subscriptions, and call the returned cleanup. Direct service `on` / `once` remain compatible with the channel API and require the caller's usual listener management.
- `tasks()` returns one store per window. It polls at 250 ms while active, never overlaps polls, performs a final read and removes its listener/timer when unused. Cancel/clear wait for backend confirmation.

The preload buffers initial mutations and validation counters, deduplicates revisions, preserves order and separates recreated resources by epoch. RPC commit/revalidation require acquisition by the calling window. Legacy frames without revisions/epochs remain supported during the Vue transition. Avoid new callers of the raw state bridge: the framework store owns that state's subscription and release.

Run from `launcher`: `pnpm exec vitest run packages/renderer-client xmcl-runtime/service/ServiceStateContainer.test.ts xmcl-runtime/service/ServiceStateManager.test.ts`. Native React Strict Mode and Vue mutation evidence is in the migration E2E specs 03/04. These checks do not replace full feature acceptance or final performance/security measurements.
