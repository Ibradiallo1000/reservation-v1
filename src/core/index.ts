// src/core/index.ts — Barrel export for core (permissions, subscription, intelligence, aggregates)
export * from "./permissions";
export * from "./subscription";
export * from "./intelligence";
export * from "./aggregates";
export { useCapabilities } from "./hooks/useCapabilities";
