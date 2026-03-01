# Production crash — forwardRef / icons bundle fix

## Error

- **Production:** `Uncaught TypeError: Cannot read properties of undefined (reading 'forwardRef')` in `icons-*.js`
- **Symptom:** Blank yellow screen on Netlify (desktop + mobile)

## Root cause

Same as the previous `createContext` crash with the router chunk:

- **Vite `manualChunks`** was putting **lucide-react** into a separate **`icons`** chunk.
- That chunk was loaded without the same React instance as the app, so inside the icons code **React** was `undefined` and `React.forwardRef` threw.

## Fixes applied

### 1. Vite config (`vite.config.ts`)

- **Removed** the `icons` chunk: no more `if (id.includes('lucide-react')) return 'icons'`.
- **lucide-react** now stays in the **vendor** chunk with **React** and **react-dom**, so a single React instance is used everywhere.
- **Added** `resolve.dedupe: ['react', 'react-dom']` so the bundler uses one copy of React.
- **Added** `optimizeDeps.include: ['react', 'react-dom']` so Vite pre-bundles them correctly in dev.

### 2. Global ErrorBoundary (`src/index.tsx`)

- The root app tree is wrapped in **`<ErrorBoundary>`** (existing `@/shared/core/ErrorBoundary`).
- Any uncaught React render error (e.g. in a child) is caught and the fallback (`MobileErrorScreen`) is shown instead of a blank/yellow screen.

## Validation

- **Production build:** Run `npm run build` then `npm run preview` (or deploy to Netlify). No `forwardRef` error, no blank screen.
- **No separate icons chunk:** Only `firebase` is split; `vendor` contains React, react-dom, react-router-dom, lucide-react.
- **No duplicate hero:** `HeroCompanySection` is used only once per page (e.g. in `PublicCompanyPage`); no change needed.
- **Single React:** `resolve.dedupe` + single vendor chunk ensure one React instance.

## Optional: verify React dedupe

If you ever see multiple React instances again, run:

```bash
npm ls react
```

If multiple versions appear, run:

```bash
npm dedupe
```

Then align to React 18 in `package.json` and reinstall.
