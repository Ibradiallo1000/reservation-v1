/**
 * Decision Engine — Transformation des données du poste de pilotage en décisions actionnables.
 * Chaque problème répond à : Pourquoi ? Combien ça coûte ? Que faire ?
 * Ne modifie pas les services existants ; couche de transformation uniquement.
 */

import { computeCeoGlobalStatus } from "./ceoRiskRules";
import { ACCOUNT_CRITICAL_THRESHOLD, ACCOUNT_WARNING_THRESHOLD, AGENCIES_AT_RISK_CRITICAL_COUNT } from "./strategicThresholds";

// ─── Types de sortie (commun CEO / Manager) — V2 Copilote décision ─────────────

export type DecisionStatus = "BON" | "SURVEILLANCE" | "CRITIQUE";

/** Option d'action pour un problème (2 à 3 par problème) */
export interface DecisionOption {
  label: string;
  /** Impact estimé en FCFA (positif = gain, négatif = perte évitée) */
  estimatedImpact: number;
  risk: "low" | "medium" | "high";
  /** low = action rapide (clic, validation), medium = coordination, high = changement structurel */
  effort: "low" | "medium" | "high";
  /** immediate = effet aujourd'hui, short = 1–3 jours, medium = plusieurs jours / semaine */
  timeToImpact: "immediate" | "short" | "medium";
}

export interface DecisionProblem {
  id: string;
  title: string;
  cause: string;
  impact: string;
  impactAmount: number;
  urgency: number;
  confidence: number;
  /** 5 = critique absolu, 4 = très important, 3 = important, 2 = modéré, 1 = information */
  businessCriticality: number;
  /** finalScore = impactAmount × urgency × confidence × businessCriticality */
  score: number;
  consequences: {
    ifAction: string;
    ifNoAction: string;
  };
  /** Projection temporelle (FCFA) — cohérence > précision */
  projection: {
    nextDay: number;
    nextWeek: number;
  };
  options: DecisionOption[];
  /** Index de l'option recommandée (meilleur ratio impact / effort / risk) */
  recommendedOptionIndex: number;
  actionRoute: string;
  level: "danger" | "warning";
}

export interface DecisionOpportunity {
  id: string;
  titre: string;
  preuve: string;
  actionSuggeree: string;
}

export interface DecisionAction {
  id: string;
  label: string;
  route: string;
  /** Id du problème source (pour traçabilité) */
  sourceProblemId: string;
}

export interface DecisionEngineResult {
  status: DecisionStatus;
  /** 2–3 points pour "Où en est-on ?" */
  summary: string[];
  problems: DecisionProblem[];
  opportunities: DecisionOpportunity[];
  /** Max 3 actions, triées par impact */
  actions: DecisionAction[];
}

// ─── Constantes opportunités ─────────────────────────────────────────────────

const OPPORTUNITY_GROWTH_PCT = 5;
const OPPORTUNITY_FILL_RATE_GOOD = 80;

// ─── Scoring : finalScore = impact × urgency × confidence × businessCriticality ───────────

/** finalScore = impactAmount (FCFA) × urgency (1–5) × confidence (0–1) × businessCriticality (1–5) */
function computeDecisionScore(
  impactAmount: number,
  urgency: number,
  confidence: number,
  businessCriticality: number
): number {
  return Math.round(impactAmount * urgency * confidence * businessCriticality);
}

const EFFORT_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3 };
const RISK_WEIGHT: Record<string, number> = { low: 1, medium: 2, high: 3 };

/** Meilleur ratio impact / effort / risk : privilégier gain élevé, effort faible, risque faible */
function getRecommendedOptionIndex(options: DecisionOption[]): number {
  if (options.length === 0) return 0;
  let best = 0;
  let bestScore = -Infinity;
  options.forEach((opt, i) => {
    const effortW = EFFORT_WEIGHT[opt.effort] ?? 2;
    const riskW = RISK_WEIGHT[opt.risk] ?? 2;
    const ratio = opt.estimatedImpact / (effortW * riskW);
    if (ratio > bestScore) {
      bestScore = ratio;
      best = i;
    }
  });
  return best;
}

/** Construit un DecisionProblem avec score, projection et recommendedOptionIndex */
function buildProblem(problem: {
  id: string;
  title: string;
  cause: string;
  impact: string;
  impactAmount: number;
  urgency: number;
  confidence: number;
  businessCriticality: number;
  consequences: { ifAction: string; ifNoAction: string };
  projection: { nextDay: number; nextWeek: number };
  options: DecisionOption[];
  actionRoute: string;
  level: "danger" | "warning";
}): DecisionProblem {
  const score = computeDecisionScore(
    problem.impactAmount,
    problem.urgency,
    problem.confidence,
    problem.businessCriticality
  );
  const recommendedOptionIndex = getRecommendedOptionIndex(problem.options);
  return { ...problem, score, recommendedOptionIndex };
}

// ─── CEO : entrée (données déjà chargées par CEOCommandCenterPage) ───────────

export interface CeoDecisionInput {
  /** Statut santé (stable / attention / danger) */
  healthStatus: "stable" | "attention" | "danger";
  /** État réseau aujourd'hui (bon / moyen / critique) */
  networkStatusToday: "bon" | "moyen" | "critique" | null;
  /** Agences sans revenu sur la période */
  agencyProfits: { agencyId: string; nom: string; revenue: number }[];
  /** Comptes sous seuils */
  financialAccounts: { id: string; agencyId: string | null; currentBalance: number }[];
  /** Sessions caisse avec écart */
  cashDiscrepancyList: Array<{ agencyId: string; session: { discrepancy?: number } }>;
  /** Sessions courrier avec écart */
  courierDiscrepancyList: Array<{ agencyId: string; session: { difference?: number } }>;
  /** Top agences par CA (pour opportunités) */
  topAgenciesByRevenue: { agencyId: string; nom: string; revenue: number }[];
  /** Stats période précédente (pour comparaison et opportunités) */
  prevStats: { totalRevenue: number; totalTickets: number; comparisonLabel: string } | null;
  /** CA période actuelle */
  currentRevenue: number;
  /** Bus en retard aujourd'hui */
  delayedBusesCount: number | null;
  /** Remplissage réseau (0–100) pour opportunités */
  fillRatePct: number;
  /** Nom total d'agences (pour résumé) */
  totalAgencies: number;
  /** Agences actives sur la période */
  activeAgenciesCount: number;
  /** Seuil écart caisse considéré critique */
  maxCashDiscrepancyThreshold?: number;
  /** Noms des agences (agencyId -> nom) */
  getAgencyName: (agencyId: string) => string;
  /** Écart financier : encaissements > ventes (transactions orphelines ou incohérences) */
  financialGap?: { salesTotal: number; cashTotal: number; orphanAmount: number };
}

/**
 * Construit la sortie Decision Engine pour le poste de pilotage CEO.
 */
export function buildCeoDecisions(input: CeoDecisionInput): DecisionEngineResult {
  const {
    healthStatus,
    networkStatusToday,
    agencyProfits,
    financialAccounts,
    cashDiscrepancyList,
    courierDiscrepancyList,
    topAgenciesByRevenue,
    prevStats,
    currentRevenue,
    delayedBusesCount,
    fillRatePct,
    totalAgencies,
    activeAgenciesCount,
    getAgencyName,
    financialGap,
  } = input;

  const threshold = Number(input.maxCashDiscrepancyThreshold ?? 0);
  const accountsBelowCritical = financialAccounts.filter(
    (a) => a.currentBalance < ACCOUNT_CRITICAL_THRESHOLD && a.currentBalance >= 0
  ).length;
  const accountsBelowWarning = financialAccounts.filter(
    (a) => a.currentBalance < ACCOUNT_WARNING_THRESHOLD && a.currentBalance >= 0
  ).length;
  const zeroRevAgencies = agencyProfits.filter((p) => p.revenue === 0);
  const agenciesAtRiskCount = zeroRevAgencies.length;

  // ─── Status ───────────────────────────────────────────────────────────────
  let status: DecisionStatus = "BON";
  if (
    healthStatus === "danger" ||
    networkStatusToday === "critique"
  ) {
    status = "CRITIQUE";
  } else if (
    healthStatus === "attention" ||
    networkStatusToday === "moyen" ||
    accountsBelowWarning > 0 ||
    (delayedBusesCount ?? 0) > 0
  ) {
    status = "SURVEILLANCE";
  }

  // ─── Summary (2–3 points) ─────────────────────────────────────────────────
  const summary: string[] = [];
  if (totalAgencies > 0) {
    summary.push(`${activeAgenciesCount} / ${totalAgencies} agences actives sur la période.`);
  }
  if (networkStatusToday === "bon") {
    summary.push("Réseau opérationnel.");
  } else if (networkStatusToday === "moyen") {
    summary.push("Réseau à surveiller (remplissage ou retards).");
  } else if (networkStatusToday === "critique") {
    summary.push("Réseau en difficulté — vérifier remplissage, agences et retards.");
  }
  if (prevStats && currentRevenue > 0 && prevStats.totalRevenue > 0) {
    const changePct = ((currentRevenue - prevStats.totalRevenue) / prevStats.totalRevenue) * 100;
    summary.push(`CA ${changePct >= 0 ? "+" : ""}${changePct.toFixed(0)} % ${prevStats.comparisonLabel}.`);
  } else if (summary.length < 3) {
    summary.push(`CA période : ${currentRevenue > 0 ? "activité enregistrée" : "aucune vente"}.`);
  }

  // ─── Problems (impactAmount FCFA, urgency 1–5, confidence 0–1, consequences, options 2–3) ───
  const problemsRaw: DecisionProblem[] = [];

  if (financialGap && financialGap.cashTotal + financialGap.orphanAmount > financialGap.salesTotal) {
    const gapAmount = financialGap.cashTotal + financialGap.orphanAmount - financialGap.salesTotal;
    problemsRaw.push(buildProblem({
      id: "financial-gap",
      title: "Écart financier détecté",
      cause: "Les encaissements dépassent les ventes enregistrées (transactions orphelines ou réservations supprimées sans remboursement caisse).",
      impact: `+${gapAmount.toLocaleString("fr-FR")} FCFA non justifié — risque de double comptage ou données incohérentes.`,
      impactAmount: gapAmount,
      urgency: 5,
      confidence: 0.9,
      businessCriticality: 5,
      consequences: {
        ifAction: "Rapprochement des transactions orphelines et correction des remboursements manquants.",
        ifNoAction: "Poursuite des incohérences et décisions basées sur des chiffres faux.",
      },
      projection: { nextDay: gapAmount, nextWeek: Math.round(gapAmount * 1.1) },
      options: [
        { label: "Vérifier transactions orphelines (Audit & contrôle)", estimatedImpact: gapAmount, risk: "low", effort: "medium", timeToImpact: "short" },
        { label: "Exécuter le script de détection des incohérences", estimatedImpact: gapAmount, risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Ne rien faire", estimatedImpact: -gapAmount, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "audit-controle",
      level: "danger",
    }));
  }

  if (accountsBelowCritical > 0) {
    const totalUnder = financialAccounts
      .filter((a) => a.currentBalance < ACCOUNT_CRITICAL_THRESHOLD && a.currentBalance >= 0)
      .reduce((sum, a) => sum + (ACCOUNT_CRITICAL_THRESHOLD - a.currentBalance), 0);
    const impactAmount = Math.max(totalUnder, 50000);
    problemsRaw.push(buildProblem({
      id: "accounts-critical",
      title: `Comptes sous seuil danger (${accountsBelowCritical})`,
      cause: `${accountsBelowCritical} compte(s) trésorerie sous ${ACCOUNT_CRITICAL_THRESHOLD} — risque de liquidité.`,
      impact: totalUnder > 0 ? `Déficit cumulé estimé : ${totalUnder.toLocaleString("fr-FR")} (écart au seuil).` : `${accountsBelowCritical} compte(s) concerné(s).`,
      impactAmount,
      urgency: 5,
      confidence: 0.9,
      businessCriticality: 5,
      consequences: {
        ifAction: "Rétablissement des liquidités et reprise du contrôle trésorerie.",
        ifNoAction: "Risque de blocage des paiements et perte de confiance des partenaires.",
      },
      projection: { nextDay: totalUnder, nextWeek: totalUnder * 1.5 },
      options: [
        { label: "Renflouer les comptes et identifier la cause", estimatedImpact: totalUnder, risk: "low", effort: "medium", timeToImpact: "short" },
        { label: "Réduire les sorties et reporter les dépenses non urgentes", estimatedImpact: Math.round(totalUnder * 0.5), risk: "medium", effort: "medium", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -totalUnder, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "finances?tab=liquidites",
      level: "danger",
    }));
  }

  if (zeroRevAgencies.length > 0) {
    const names = zeroRevAgencies.slice(0, 5).map((a) => a.nom).join(", ");
    const more = zeroRevAgencies.length > 5 ? ` et ${zeroRevAgencies.length - 5} autre(s)` : "";
    const estCaPerdu = zeroRevAgencies.length * 150000;
    problemsRaw.push(buildProblem({
      id: "agencies-no-revenue",
      title: `Agences sans revenu (${zeroRevAgencies.length})`,
      cause: `Aucune vente enregistrée sur la période pour : ${names}${more}.`,
      impact: `CA potentiel perdu : ${zeroRevAgencies.length} agence(s) inactives — à comparer à l'historique.`,
      impactAmount: estCaPerdu,
      urgency: zeroRevAgencies.length >= AGENCIES_AT_RISK_CRITICAL_COUNT ? 5 : 4,
      confidence: 0.5,
      businessCriticality: zeroRevAgencies.length >= AGENCIES_AT_RISK_CRITICAL_COUNT ? 5 : 4,
      consequences: {
        ifAction: "Identification des causes et relance de l'activité ou réaffectation des moyens.",
        ifNoAction: "Perte de CA récurrente et dégradation de la performance réseau.",
      },
      projection: { nextDay: Math.round(estCaPerdu * 0.3), nextWeek: estCaPerdu },
      options: [
        { label: "Analyser réservations réseau et relancer par agence", estimatedImpact: Math.round(estCaPerdu * 0.6), risk: "low", effort: "medium", timeToImpact: "short" },
        { label: "Contacter les agences et vérifier l'offre (horaires, prix)", estimatedImpact: Math.round(estCaPerdu * 0.3), risk: "medium", effort: "low", timeToImpact: "immediate" },
        { label: "Ne rien faire", estimatedImpact: -estCaPerdu, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "reservations-reseau",
      level: agenciesAtRiskCount >= AGENCIES_AT_RISK_CRITICAL_COUNT ? "danger" : "warning",
    }));
  }

  const criticalCash = cashDiscrepancyList.filter(
    (x) => Math.abs(Number(x.session.discrepancy ?? 0)) >= threshold
  );
  if (criticalCash.length > 0 && threshold > 0) {
    const totalCashGap = criticalCash.reduce((s, x) => s + Math.abs(Number(x.session.discrepancy ?? 0)), 0);
    problemsRaw.push(buildProblem({
      id: "cash-discrepancy",
      title: `Écart(s) de caisse (${criticalCash.length} session(s))`,
      cause: "Une ou plusieurs sessions guichet clôturées présentent un écart entre encaissements déclarés et comptés.",
      impact: `Montant total des écarts : ${totalCashGap.toLocaleString("fr-FR")}.`,
      impactAmount: totalCashGap,
      urgency: 5,
      confidence: 0.9,
      businessCriticality: 5,
      consequences: {
        ifAction: "Correction immédiate du déficit et rapprochement des sessions.",
        ifNoAction: "Risque d'amplification et perte de contrôle financier.",
      },
      projection: { nextDay: totalCashGap, nextWeek: Math.round(totalCashGap * 1.3) },
      options: [
        { label: "Vérifier et régulariser dans Audit & contrôle", estimatedImpact: totalCashGap, risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Contrôler les prochaines sessions et former les guichetiers", estimatedImpact: Math.round(totalCashGap * 0.5), risk: "medium", effort: "medium", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -totalCashGap, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "audit-controle",
      level: "danger",
    }));
  }

  const criticalCourier = courierDiscrepancyList.filter(
    (x) => Math.abs(Number(x.session.difference ?? 0)) >= threshold
  );
  if (criticalCourier.length > 0 && threshold > 0) {
    const totalCourierGap = criticalCourier.reduce((s, x) => s + Math.abs(Number(x.session.difference ?? 0)), 0);
    problemsRaw.push(buildProblem({
      id: "courier-discrepancy",
      title: `Écart(s) courrier (${criticalCourier.length} session(s))`,
      cause: "Sessions courrier avec différence entre montants attendus et déclarés.",
      impact: `Montant total des écarts : ${totalCourierGap.toLocaleString("fr-FR")}.`,
      impactAmount: totalCourierGap,
      urgency: 4,
      confidence: 0.9,
      businessCriticality: 4,
      consequences: {
        ifAction: "Régularisation des sessions et alignement comptable.",
        ifNoAction: "Écarts non résolus et risque de contentieux.",
      },
      projection: { nextDay: totalCourierGap, nextWeek: Math.round(totalCourierGap * 1.2) },
      options: [
        { label: "Valider et régulariser dans Audit & contrôle", estimatedImpact: totalCourierGap, risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Reporter et revoir processus courrier", estimatedImpact: 0, risk: "medium", effort: "high", timeToImpact: "medium" },
        { label: "Ne rien faire", estimatedImpact: -totalCourierGap, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "audit-controle",
      level: "warning",
    }));
  }

  if (accountsBelowWarning > 0 && accountsBelowCritical === 0) {
    const totalUnderWarn = financialAccounts
      .filter((a) => a.currentBalance < ACCOUNT_WARNING_THRESHOLD && a.currentBalance >= 0)
      .reduce((sum, a) => sum + (ACCOUNT_WARNING_THRESHOLD - a.currentBalance), 0);
    problemsRaw.push(buildProblem({
      id: "accounts-warning",
      title: `Comptes sous seuil d'avertissement (${accountsBelowWarning})`,
      cause: `Solde(s) entre ${ACCOUNT_WARNING_THRESHOLD} et ${ACCOUNT_CRITICAL_THRESHOLD} — vigilance liquidités.`,
      impact: `${accountsBelowWarning} compte(s) à surveiller.`,
      impactAmount: Math.max(totalUnderWarn, 25000),
      urgency: 3,
      confidence: 0.9,
      businessCriticality: 3,
      consequences: {
        ifAction: "Anticipation des encaissements ou transferts pour rester au-dessus du seuil critique.",
        ifNoAction: "Risque de basculement sous le seuil danger.",
      },
      projection: { nextDay: Math.round(totalUnderWarn * 0.2), nextWeek: totalUnderWarn },
      options: [
        { label: "Renflouer ou transférer pour sécuriser", estimatedImpact: totalUnderWarn, risk: "low", effort: "medium", timeToImpact: "short" },
        { label: "Surveiller et planifier les encaissements", estimatedImpact: Math.round(totalUnderWarn * 0.5), risk: "medium", effort: "low", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -totalUnderWarn, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "finances?tab=liquidites",
      level: "warning",
    }));
  }

  const delayed = delayedBusesCount ?? 0;
  if (delayed > 0) {
    const estPerteRetard = delayed * 50000;
    problemsRaw.push(buildProblem({
      id: "delayed-buses",
      title: `Bus en retard (${delayed})`,
      cause: "Un ou plusieurs véhicules ont dépassé l'heure prévue de départ ou d'arrivée.",
      impact: `${delayed} trajet(s) affecté(s) — risque insatisfaction client et report de ventes.`,
      impactAmount: estPerteRetard,
      urgency: delayed >= 3 ? 5 : 4,
      confidence: 0.7,
      businessCriticality: delayed >= 3 ? 4 : 3,
      consequences: {
        ifAction: "Coordination avec les agences et limitation des retards en chaîne.",
        ifNoAction: "Insatisfaction client et perte de ventes sur les trajets concernés.",
      },
      projection: { nextDay: Math.round(estPerteRetard * 0.5), nextWeek: estPerteRetard * 2 },
      options: [
        { label: "Consulter la flotte (filtre retard) et coordonner", estimatedImpact: Math.round(estPerteRetard * 0.5), risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Informer les agences et reporter les départs suivants", estimatedImpact: Math.round(estPerteRetard * 0.3), risk: "medium", effort: "medium", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -estPerteRetard, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "flotte?filter=retard",
      level: delayed >= 3 ? "danger" : "warning",
    }));
  }

  const problems = problemsRaw.sort((a, b) => b.score - a.score);

  // ─── Opportunities ────────────────────────────────────────────────────────
  const opportunities: DecisionOpportunity[] = [];

  if (prevStats && prevStats.totalRevenue > 0 && currentRevenue > prevStats.totalRevenue) {
    const changePct = ((currentRevenue - prevStats.totalRevenue) / prevStats.totalRevenue) * 100;
    if (changePct >= OPPORTUNITY_GROWTH_PCT) {
      opportunities.push({
        id: "revenue-growth",
        titre: "CA en hausse",
        preuve: `+${changePct.toFixed(0)} % ${prevStats.comparisonLabel}`,
        actionSuggeree: "Analyser les lignes et agences qui performent pour renforcer la communication.",
      });
    }
  }

  if (fillRatePct >= OPPORTUNITY_FILL_RATE_GOOD) {
    opportunities.push({
      id: "fill-rate-good",
      titre: "Bon taux de remplissage réseau",
      preuve: `${fillRatePct} % de remplissage sur la période`,
      actionSuggeree: "Envisager d'ajouter des départs sur les créneaux saturés.",
    });
  }

  if (topAgenciesByRevenue.length >= 1) {
    const top = topAgenciesByRevenue[0];
    if (top.revenue > 0) {
      opportunities.push({
        id: "top-agency",
        titre: "Agence performante",
        preuve: `${top.nom} : ${top.revenue.toLocaleString("fr-FR")} sur la période`,
        actionSuggeree: "S'appuyer sur les bonnes pratiques de cette agence pour les autres.",
      });
    }
  }

  // ─── Actions (max 3, dérivées des problèmes au plus haut score) ─────────────
  const topByScore = problems.slice(0, 3);
  const actions: DecisionAction[] = topByScore.map((p, i) => {
    const opt = p.options[p.recommendedOptionIndex];
    return {
      id: `act-${p.id}-${i}`,
      label: opt?.label ?? p.options[0]?.label ?? p.title,
      route: p.actionRoute,
      sourceProblemId: p.id,
    };
  });

  return {
    status,
    summary,
    problems,
    opportunities,
    actions,
  };
}

// ─── Manager : entrée (données ManagerCockpitPage + useManagerAlerts) ────────

export interface ManagerAlertForDecision {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  link: string;
  /** Optionnel : montant écart (pour écart de caisse) */
  amount?: number;
  /** Optionnel : nombre (départs en retard, etc.) */
  count?: number;
}

export interface ManagerDecisionInput {
  /** CA période */
  revenue: number;
  /** Billets période */
  tickets: number;
  /** Taux de remplissage moyen (0–100) */
  fillRatePct: number;
  /** Trésorerie agence */
  cashPosition: number;
  /** Écart caisse (cashPosition - todayRevenue + todayExpenses) si pertinent */
  cashVariance?: number;
  /** Alertes du hook useManagerAlerts */
  alerts: ManagerAlertForDecision[];
  /** Départs en retard (nombre) */
  delayedDeparturesCount: number;
  /** Départs avec faible remplissage (< 30 %) */
  lowFillDeparturesCount: number;
  /** Rapports en attente compta (closed) */
  pendingComptaCount: number;
  /** Rapports à approuver chef (validated, lockedComptable, !lockedChef) */
  pendingChefApprovalCount: number;
  /** Période précédente pour comparaison (optionnel) */
  prevRevenue?: number;
  prevTickets?: number;
  comparisonLabel?: string;
  /** Créneaux avec remplissage > 80 % (pour opportunités) */
  fullSlotsCount?: number;
  totalSlotsCount?: number;
}

/**
 * Calcule le statut global du poste manager (équivalent CEO).
 */
export function computeManagerGlobalStatus(input: {
  hasCriticalAlerts: boolean;
  hasWarningAlerts: boolean;
  cashVariance: number;
  pendingChefApprovalCount: number;
}): DecisionStatus {
  const { hasCriticalAlerts, hasWarningAlerts, cashVariance, pendingChefApprovalCount } = input;
  if (hasCriticalAlerts || Math.abs(cashVariance) > 0 || pendingChefApprovalCount > 0) {
    return "CRITIQUE";
  }
  if (hasWarningAlerts) return "SURVEILLANCE";
  return "BON";
}

/**
 * Construit la sortie Decision Engine pour le poste de pilotage Chef d'agence.
 */
export function buildManagerDecisions(input: ManagerDecisionInput): DecisionEngineResult {
  const {
    revenue,
    tickets,
    fillRatePct,
    cashPosition,
    cashVariance = 0,
    alerts,
    delayedDeparturesCount,
    lowFillDeparturesCount,
    pendingComptaCount,
    pendingChefApprovalCount,
    prevRevenue,
    prevTickets,
    comparisonLabel,
    fullSlotsCount = 0,
    totalSlotsCount = 0,
  } = input;

  const hasCriticalAlerts = alerts.some((a) => a.severity === "critical");
  const hasWarningAlerts = alerts.some((a) => a.severity === "warning");
  const status = computeManagerGlobalStatus({
    hasCriticalAlerts,
    hasWarningAlerts,
    cashVariance,
    pendingChefApprovalCount,
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  const summary: string[] = [];
  summary.push(`CA période : ${revenue.toLocaleString("fr-FR")} — ${tickets} billets.`);
  summary.push(`Remplissage moyen : ${fillRatePct} %. Trésorerie agence : ${cashPosition.toLocaleString("fr-FR")}.`);
  if (pendingChefApprovalCount > 0) {
    summary.push(`${pendingChefApprovalCount} rapport(s) à approuver.`);
  } else if (pendingComptaCount > 0) {
    summary.push(`${pendingComptaCount} rapport(s) en attente compta.`);
  } else if (alerts.length === 0) {
    summary.push("Aucune alerte prioritaire.");
  }

  // ─── Problems (impactAmount, urgency, confidence, consequences, options) ───
  const problemsRaw: DecisionProblem[] = [];

  if (pendingChefApprovalCount > 0) {
    const impactAmount = 100000 * pendingChefApprovalCount;
    problemsRaw.push(buildProblem({
      id: "pending-chef",
      title: `${pendingChefApprovalCount} rapport(s) à approuver`,
      cause: "Rapports validés par le comptable, en attente de votre approbation.",
      impact: "Retard de clôture comptable et de réconciliation.",
      impactAmount,
      urgency: 5,
      confidence: 0.9,
      businessCriticality: 5,
      consequences: {
        ifAction: "Clôture comptable à jour et réconciliation des caisses.",
        ifNoAction: "Retard persistant et blocage des contrôles.",
      },
      projection: { nextDay: impactAmount, nextWeek: impactAmount * 2 },
      options: [
        { label: `Approuver les ${pendingChefApprovalCount} rapport(s) dans Finances`, estimatedImpact: impactAmount, risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Vérifier d'abord les montants puis approuver", estimatedImpact: Math.round(impactAmount * 0.8), risk: "medium", effort: "medium", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -impactAmount, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "/agence/finances",
      level: "danger",
    }));
  }

  if (cashVariance !== 0) {
    const absVariance = Math.abs(cashVariance);
    problemsRaw.push(buildProblem({
      id: "cash-variance",
      title: "Écart de caisse détecté",
      cause: "La caisse ne concorde pas avec les ventes du jour et les dépenses enregistrées.",
      impact: `Écart : ${absVariance.toLocaleString("fr-FR")} (${cashVariance > 0 ? "surplus" : "manque"}).`,
      impactAmount: absVariance,
      urgency: 5,
      confidence: 0.9,
      businessCriticality: 5,
      consequences: {
        ifAction: "Correction immédiate du déficit ou régularisation du surplus.",
        ifNoAction: "Risque d'amplification et perte de contrôle financier.",
      },
      projection: { nextDay: absVariance, nextWeek: Math.round(absVariance * 1.3) },
      options: [
        { label: "Vérifier mouvements et rapports de caisse dans Finances", estimatedImpact: absVariance, risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Contrôler les prochaines sessions avant de régulariser", estimatedImpact: Math.round(absVariance * 0.5), risk: "medium", effort: "medium", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -absVariance, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "/agence/finances",
      level: "danger",
    }));
  }

  if (pendingComptaCount > 0) {
    const impactAmount = 50000 * pendingComptaCount;
    problemsRaw.push(buildProblem({
      id: "pending-compta",
      title: `${pendingComptaCount} rapport(s) en attente du comptable`,
      cause: "Sessions clôturées non encore validées par le comptable.",
      impact: "Retard de validation et de rapprochement.",
      impactAmount,
      urgency: 4,
      confidence: 0.9,
      businessCriticality: 4,
      consequences: {
        ifAction: "Relance du comptable et validation en chaîne.",
        ifNoAction: "Retard de réconciliation et accumulation des écarts.",
      },
      projection: { nextDay: Math.round(impactAmount * 0.3), nextWeek: impactAmount },
      options: [
        { label: "Relancer la validation compta dans Finances", estimatedImpact: impactAmount, risk: "low", effort: "low", timeToImpact: "short" },
        { label: "Traiter manuellement les rapports prioritaires", estimatedImpact: Math.round(impactAmount * 0.6), risk: "medium", effort: "medium", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -impactAmount, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "/agence/finances",
      level: "warning",
    }));
  }

  const noCounterAlert = alerts.find((a) => a.title.includes("guichet actif") || a.id.includes("no-counter"));
  if (noCounterAlert) {
    const impactAmount = 200000;
    problemsRaw.push(buildProblem({
      id: "no-counter",
      title: noCounterAlert.title,
      cause: "Des départs sont ouverts mais aucun poste guichet n'est en service.",
      impact: "Ventes perdues sur les départs concernés.",
      impactAmount,
      urgency: 5,
      confidence: 0.9,
      businessCriticality: 5,
      consequences: {
        ifAction: "Reprise des ventes dès qu'un guichet est activé ou départs clôturés.",
        ifNoAction: "Ventes perdues et insatisfaction client.",
      },
      projection: { nextDay: impactAmount, nextWeek: impactAmount * 3 },
      options: [
        { label: "Activer un guichet immédiatement", estimatedImpact: impactAmount, risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Clôturer les départs non servis", estimatedImpact: 0, risk: "medium", effort: "low", timeToImpact: "immediate" },
        { label: "Ne rien faire", estimatedImpact: -impactAmount, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: noCounterAlert.link,
      level: "danger",
    }));
  }

  if (delayedDeparturesCount > 0) {
    const impactAmount = delayedDeparturesCount * 30000;
    problemsRaw.push(buildProblem({
      id: "delayed-departures",
      title: delayedDeparturesCount === 1 ? "1 départ en retard" : `${delayedDeparturesCount} départs en retard`,
      cause: "Un ou plusieurs départs ont dépassé l'heure prévue.",
      impact: `${delayedDeparturesCount} départ(s) affecté(s) — risque insatisfaction client.`,
      impactAmount,
      urgency: 4,
      confidence: 0.7,
      businessCriticality: 4,
      consequences: {
        ifAction: "Coordination avec les guichets et limitation des retards.",
        ifNoAction: "Insatisfaction client et perte de ventes.",
      },
      projection: { nextDay: Math.round(impactAmount * 0.5), nextWeek: impactAmount * 2 },
      options: [
        { label: "Consulter Opérations et coordonner avec les guichets", estimatedImpact: Math.round(impactAmount * 0.5), risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Informer les clients et reporter si besoin", estimatedImpact: Math.round(impactAmount * 0.3), risk: "medium", effort: "medium", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -impactAmount, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "/agence/operations",
      level: "warning",
    }));
  }

  if (lowFillDeparturesCount > 0) {
    const siegesVides = lowFillDeparturesCount * 35;
    const prixMoyen = 5000;
    const impactAmount = siegesVides * prixMoyen;
    problemsRaw.push(buildProblem({
      id: "low-fill",
      title: lowFillDeparturesCount === 1 ? "1 départ avec faible remplissage" : `${lowFillDeparturesCount} départs avec faible remplissage`,
      cause: "Remplissage < 30 % sur un ou plusieurs créneaux.",
      impact: `Sièges vides : ${lowFillDeparturesCount} créneau(x) sous-utilisé(s) — potentiel CA non réalisé.`,
      impactAmount,
      urgency: 3,
      confidence: 0.5,
      businessCriticality: 3,
      consequences: {
        ifAction: "Réduction des pertes estimée (réduire un départ ou promouvoir le créneau).",
        ifNoAction: "Perte estimée demain sur les mêmes créneaux.",
      },
      projection: { nextDay: Math.round(impactAmount * 0.2), nextWeek: impactAmount },
      options: [
        { label: "Réduire un départ pour limiter les coûts", estimatedImpact: 150000, risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Maintenir + promotion sur le créneau", estimatedImpact: 80000, risk: "medium", effort: "medium", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -impactAmount, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: "/agence/operations",
      level: "warning",
    }));
  }

  const longSessionAlert = alerts.find((a) => a.title.includes("session") && a.title.includes("h"));
  if (longSessionAlert) {
    problemsRaw.push(buildProblem({
      id: "long-sessions",
      title: longSessionAlert.title,
      cause: "Une ou plusieurs sessions guichet sont ouvertes depuis plus de 8 h.",
      impact: "Risque fatigue et erreurs de caisse.",
      impactAmount: 50000,
      urgency: 3,
      confidence: 0.7,
      businessCriticality: 2,
      consequences: {
        ifAction: "Pause ou relève planifiée — réduction du risque d'erreur.",
        ifNoAction: "Risque d'erreurs de caisse et de contentieux.",
      },
      projection: { nextDay: 25000, nextWeek: 50000 },
      options: [
        { label: "Planifier une pause ou une relève (Dashboard)", estimatedImpact: 50000, risk: "low", effort: "low", timeToImpact: "immediate" },
        { label: "Surveiller et rappeler la procédure de clôture", estimatedImpact: 25000, risk: "medium", effort: "low", timeToImpact: "short" },
        { label: "Ne rien faire", estimatedImpact: -50000, risk: "high", effort: "low", timeToImpact: "immediate" },
      ],
      actionRoute: longSessionAlert.link,
      level: "warning",
    }));
  }

  const problems = problemsRaw.sort((a, b) => b.score - a.score);

  // ─── Actions (max 3, dérivées des problèmes au plus haut score) ─────────────
  const topByScoreM = problems.slice(0, 3);
  const actions: DecisionAction[] = topByScoreM.map((p, i) => {
    const opt = p.options[p.recommendedOptionIndex];
    return {
      id: `act-${p.id}-${i}`,
      label: opt?.label ?? p.options[0]?.label ?? p.title,
      route: p.actionRoute,
      sourceProblemId: p.id,
    };
  });

  // ─── Opportunities ─────────────────────────────────────────────────────────
  const opportunities: DecisionOpportunity[] = [];

  if (prevRevenue != null && prevRevenue > 0 && revenue > prevRevenue) {
    const changePct = ((revenue - prevRevenue) / prevRevenue) * 100;
    if (changePct >= OPPORTUNITY_GROWTH_PCT && comparisonLabel) {
      opportunities.push({
        id: "revenue-growth",
        titre: "CA en hausse",
        preuve: `+${changePct.toFixed(0)} % ${comparisonLabel}`,
        actionSuggeree: "Maintenir l'effort sur les créneaux qui performent.",
      });
    }
  }

  if (fillRatePct >= OPPORTUNITY_FILL_RATE_GOOD) {
    opportunities.push({
      id: "fill-good",
      titre: "Bon taux de remplissage",
      preuve: `${fillRatePct} % en moyenne sur les départs du jour`,
      actionSuggeree: "Envisager des départs supplémentaires sur les créneaux pleins.",
    });
  }

  if (totalSlotsCount > 0 && fullSlotsCount > 0) {
    const pctFull = Math.round((fullSlotsCount / totalSlotsCount) * 100);
    if (pctFull >= 20) {
      opportunities.push({
        id: "slots-full",
        titre: "Créneaux bien remplis",
        preuve: `${fullSlotsCount} créneau(x) à plus de 80 % (sur ${totalSlotsCount})`,
        actionSuggeree: "Analyser les horaires qui marchent pour les dupliquer si possible.",
      });
    }
  }

  return {
    status,
    summary,
    problems,
    opportunities,
    actions,
  };
}
