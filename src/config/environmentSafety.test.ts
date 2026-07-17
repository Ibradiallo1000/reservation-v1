import { describe, expect, it } from "vitest";
import { assertSafeFirebaseEnvironment, FIREBASE_PROJECTS } from "./environmentSafety";

describe("environment safety", () => {
  it("bloque localhost vers la production par défaut", () => {
    expect(() => assertSafeFirebaseEnvironment({ hostname: "localhost", mode: "development", projectId: FIREBASE_PROJECTS.production })).toThrow(/DÉMARRAGE BLOQUÉ/);
  });

  it("autorise localhost vers staging", () => {
    expect(assertSafeFirebaseEnvironment({ hostname: "localhost", mode: "staging", projectId: FIREBASE_PROJECTS.staging })).toMatchObject({ environment: "staging", transport: "cloud" });
  });

  it("autorise les émulateurs avec le projet local", () => {
    expect(assertSafeFirebaseEnvironment({ hostname: "127.0.0.1", mode: "emulators", projectId: FIREBASE_PROJECTS.local, useEmulators: true })).toMatchObject({ environment: "development", transport: "emulators" });
  });

  it("refuse les émulateurs avec un projet cloud", () => {
    expect(() => assertSafeFirebaseEnvironment({ hostname: "localhost", projectId: FIREBASE_PROJECTS.staging, useEmulators: true })).toThrow(/demo-teliya-local/i);
  });

  it("accepte seulement la dérogation production explicite", () => {
    expect(assertSafeFirebaseEnvironment({ hostname: "localhost", projectId: FIREBASE_PROJECTS.production, allowProductionFromLocal: true })).toMatchObject({ environment: "production", isProductionProject: true });
  });

  it("refuse un project ID absent", () => {
    expect(() => assertSafeFirebaseEnvironment({ hostname: "localhost", projectId: "" })).toThrow(/obligatoire/);
  });
});
