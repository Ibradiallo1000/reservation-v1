# TODO: Firestore Index Error - Replace alert() with Non-Blocking Toasts

## Context
When a guichet agent tries to open a cash session, a Firestore query fails because a composite index is missing. Currently `alert()` blocks the UI and the Firebase index creation link is not clickable.

## Steps

### Step 1: Update `src/utils/firestoreErrorHandler.ts`
- [x] Remove `alert()` usage from `handleFirestoreError`
- [x] Remove automatic `window.open()`
- [x] Add `isFirestoreIndexError()` helper
- [x] Log `console.error("FIRESTORE INDEX REQUIRED:", ...)` clearly
- [x] Keep anti-spam `lastShown` for console flood prevention

### Step 2: Update `src/index.tsx`
- [x] Ensure global interceptor calls the updated non-blocking `handleFirestoreError`

### Step 3: Update `src/modules/agence/guichet/pages/AgenceGuichetPage.tsx`
- [x] Import `isFirestoreIndexError`, `parseIndexUrlFromError`, `FirestoreIndexLink`
- [x] Add `isDev` check and `devIndexUrl` state
- [x] Create `handleSessionError` helper that shows toast instead of alert
- [x] Replace all `startShift().catch((e) => alert(...))` with `handleSessionError`
- [x] Replace all `pauseShift().catch((e) => alert(...))` with `handleSessionError`
- [x] Replace all `continueShift().catch((e) => alert(...))` with `handleSessionError`
- [x] Replace `closeShift` catch alert with `handleSessionError`
- [x] Replace `cancelReservation` catch alert with toast
- [x] Replace `saveEdit` catch alert with `handleSessionError`
- [x] Conditionally render `FirestoreIndexLink` in dev mode

### Step 4: Update `src/modules/agence/hooks/useActiveShift.ts`
- [x] Import `isFirestoreIndexError`
- [x] Add explicit `FIRESTORE INDEX REQUIRED` log in onSnapshot error handler

### Step 5: Verify
- [x] No remaining `alert()` calls for Firestore errors in guichet flow
- [x] Toast appears non-blocking
- [x] Dev link renders when index URL is present in dev mode

