export const FIREBASE_PROJECTS = {
  production: "monbillet-95b77",
  staging: "teliya-staging",
  local: "demo-teliya-local",
} as const;

export type RuntimeEnvironment = "development" | "staging" | "production";

export interface EnvironmentSafetyInput {
  hostname?: string;
  mode?: string;
  projectId?: string;
  useEmulators?: boolean;
  allowProductionFromLocal?: boolean;
}

export interface EnvironmentSafetyResult {
  environment: RuntimeEnvironment;
  isLocalHost: boolean;
  isProductionProject: boolean;
  projectId: string;
  transport: "emulators" | "cloud";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function resolveRuntimeEnvironment(
  mode: string | undefined,
  projectId: string,
): RuntimeEnvironment {
  if (mode === "production" || projectId === FIREBASE_PROJECTS.production) {
    return "production";
  }
  if (mode === "staging" || projectId === FIREBASE_PROJECTS.staging) {
    return "staging";
  }
  return "development";
}

export function assertSafeFirebaseEnvironment(
  input: EnvironmentSafetyInput,
): EnvironmentSafetyResult {
  const projectId = String(input.projectId ?? "").trim();
  if (!projectId) {
    throw new Error(
      "[Environment Safety] VITE_FIREBASE_PROJECT_ID est obligatoire avant toute initialisation Firebase.",
    );
  }

  const hostname = String(input.hostname ?? "").toLowerCase();
  const isLocalHost = LOCAL_HOSTS.has(hostname);
  const isProductionProject = projectId === FIREBASE_PROJECTS.production;
  const useEmulators = Boolean(input.useEmulators);

  if (useEmulators && !isLocalHost) {
    throw new Error(
      "[Environment Safety] Les émulateurs Firebase sont autorisés uniquement sur localhost.",
    );
  }
  if (useEmulators && projectId !== FIREBASE_PROJECTS.local) {
    throw new Error(
      `[Environment Safety] Le mode émulateur exige VITE_FIREBASE_PROJECT_ID=${FIREBASE_PROJECTS.local}.`,
    );
  }
  if (isLocalHost && isProductionProject && !input.allowProductionFromLocal) {
    throw new Error(
      "[Environment Safety] DÉMARRAGE BLOQUÉ : le poste local cible Firebase production. Utilisez staging/les émulateurs. Dérogation exceptionnelle uniquement avec VITE_ALLOW_PRODUCTION_FROM_LOCAL=true.",
    );
  }

  return {
    environment: resolveRuntimeEnvironment(input.mode, projectId),
    isLocalHost,
    isProductionProject,
    projectId,
    transport: useEmulators ? "emulators" : "cloud",
  };
}
