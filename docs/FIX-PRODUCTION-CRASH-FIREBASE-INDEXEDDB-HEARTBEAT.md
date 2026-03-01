# Fix production crash — Firebase IndexedDB / Heartbeat

## Error

- **Production:** `Uncaught ReferenceError: Cannot access 'AS' before initialization` at `vendor-*.js` (IndexedDB, firebase, triggerHeartbeat)
- **Cause:** Firebase IndexedDB persistence and heartbeat module bundled in a separate chunk led to initialization order issues (minified symbol `AS` used before definition).

## Root cause

1. **IndexedDB persistence** – `persistentLocalCache` + `persistentMultipleTabManager` pulled in extra Firebase internals (IndexedDB, heartbeat) that did not play well with chunk splitting.
2. **Firebase in its own chunk** – `manualChunks` was putting all `firebase` packages into a separate `firebase` chunk. That chunk’s load/init order could make `AS` (and related heartbeat/IndexedDB code) run before initialization.

## Fixes applied

### Phase 1 — Disable IndexedDB persistence (`src/firebaseConfig.ts`)

- **Removed** `persistentLocalCache`, `persistentMultipleTabManager` and the `DISABLE_PERSISTENCE` env branch.
- **Firestore** is now always initialized with **`memoryLocalCache()`**:
  - No IndexedDB.
  - No multi-tab persistence.
  - Firestore works as usual; cache is in-memory only (lost on reload).

```ts
const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: !FORCE_LONG_POLLING,
  experimentalForceLongPolling: FORCE_LONG_POLLING,
});
```

### Phase 2 — Heartbeat

- The Firebase JS SDK does **not** expose a `heartbeatServiceProvider` (or similar) in `initializeApp()`. No code change for heartbeat.
- Fixing the bundle (Phase 1 + Phase 3) avoids the initialization order that triggered the crash in the heartbeat/IndexedDB path.

### Phase 3 — Single vendor chunk (`vite.config.ts`)

- **Removed** the rule that sent `firebase` into a separate chunk (`if (id.includes('firebase')) return 'firebase'`).
- All `node_modules` (including **react**, **react-dom**, **firebase**, **lucide-react**, **react-router-dom**) now go into **one `vendor` chunk**, so initialization order is stable and the "AS before initialization" error is avoided.

### Phase 4 — Clean rebuild (for you to run)

```bash
rm -rf node_modules package-lock.json dist
npm install
npm run build
```

Then test with `npm run preview` or deploy to Netlify.

## Validation

- No IndexedDB persistence (memory cache only).
- No separate firebase chunk; firebase is in vendor.
- No "AS before initialization" / heartbeat crash in production.
- App loads in production; Firestore works normally (in-memory cache only).

## Trade-off

- **Before:** IndexedDB persistence (cache survived refresh and across tabs).
- **After:** In-memory cache only; cache is lost on full reload. Data still comes from the server; only offline/cache behavior changes.

To restore persistence later, you’d need to ensure Firebase (including IndexedDB/heartbeat) is not in a separate chunk and that the bundle initializes in a safe order (e.g. keep firebase in vendor).
