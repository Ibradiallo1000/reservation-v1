import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  ledgerAccountDocRef,
} from "@/modules/compagnie/treasury/ledgerAccounts";
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";

export type TransferRequestStatus =
  | "pending_manager"
  | "approved"
  | "rejected"
  | "executed";

export type TransferRequestDoc = {
  companyId: string;
  agencyId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description: string | null;
  bankReference?: string | null;
  depositSlipUrl?: string | null;
  status: TransferRequestStatus;
  initiatedBy: string;
  initiatedByRole: string | null;
  managerDecisionBy: string | null;
  managerDecisionAt: Timestamp | null;
  managerDecisionReason: string | null;
  executedBy: string | null;
  executedAt: Timestamp | null;
  idempotencyKey: string;
  createdAt: Timestamp;
  updatedAt: unknown;
};

const COLLECTION = "treasuryTransferRequests";

export const TRANSFER_INITIATOR_ROLES = ["agency_accountant", "comptable", "Comptable"] as const;

const INITIATOR_SET = new Set<string>(TRANSFER_INITIATOR_ROLES);

function requestsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${COLLECTION}`);
}

function canInitiateWithRoles(roles: string[]): boolean {
  return roles.some((r) => INITIATOR_SET.has((r ?? "").trim()));
}

function firstInitiatorRole(roles: string[]): string | null {
  for (const r of roles) {
    const t = (r ?? "").trim();
    if (INITIATOR_SET.has(t)) return t;
  }
  return null;
}

export async function createTransferRequest(params: {
  companyId: string;
  agencyId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description?: string | null;
  bankReference?: string | null;
  depositSlipUrl?: string | null;
  initiatedBy: string;
  /** @deprecated Préférer `initiatedByRoles` si l’utilisateur a plusieurs rôles. */
  initiatedByRole?: string | null;
  /** Tous les rôles du token / profil ; au moins un doit être initiateur autorisé. */
  initiatedByRoles?: string[] | null;
}): Promise<string> {
  console.log("[TransferService] createTransferRequest - DÉBUT");
  console.log("[TransferService] Paramètres reçus:", JSON.stringify(params, null, 2));

  const roleList =
    params.initiatedByRoles?.length != null && params.initiatedByRoles.length > 0
      ? params.initiatedByRoles.map((r) => String(r ?? "").trim()).filter(Boolean)
      : params.initiatedByRole
        ? [String(params.initiatedByRole).trim()].filter(Boolean)
        : [];
  
  console.log("[TransferService] Rôles évalués:", roleList);

  if (!canInitiateWithRoles(roleList)) {
    console.error("[TransferService] Rôle non autorisé:", roleList);
    throw new Error("Seul le comptable agence peut initier un versement.");
  }
  
  const role = firstInitiatorRole(roleList);
  console.log("[TransferService] Rôle principal:", role);

  const amount = Number(params.amount);
  console.log("[TransferService] Montant:", amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("[TransferService] Montant invalide:", amount);
    throw new Error("Montant invalide.");
  }

  const companyId = params.companyId.trim();
  const agencyId = params.agencyId.trim();
  const initiatedBy = params.initiatedBy.trim();
  const fromAccountId = params.fromAccountId.trim();
  const toAccountId = params.toAccountId.trim();

  console.log("[TransferService] Variables:", { companyId, agencyId, initiatedBy, fromAccountId, toAccountId });

  if (!companyId || !agencyId || !initiatedBy || !fromAccountId || !toAccountId) {
    console.error("[TransferService] Contexte incomplet");
    throw new Error("Contexte du versement incomplet.");
  }

  if (fromAccountId !== `agency_${agencyId}_cash`) {
    console.error("[TransferService] Compte source invalide:", fromAccountId);
    throw new Error("Le compte source ne correspond pas à la caisse de l'agence.");
  }

  if (!toAccountId.startsWith("company_bank_")) {
    console.error("[TransferService] Compte destination invalide:", toAccountId);
    throw new Error("Le compte destination doit être une banque compagnie.");
  }

  const ref = doc(requestsRef(companyId));
  const requestId = ref.id;
  const operationId = `agency_transfer_${requestId}`;
  
  console.log("[TransferService] Request ID:", requestId);
  console.log("[TransferService] Operation ID:", operationId);

  const transactionRef = doc(
    db,
    "companies",
    companyId,
    "financialTransactions",
    operationId
  );
  const idempotencyRef = doc(
    db,
    "companies",
    companyId,
    "financialTransactionIdempotency",
    operationId
  );
  const cashRef = ledgerAccountDocRef(companyId, fromAccountId);
  const bankRef = ledgerAccountDocRef(companyId, toAccountId);
  
  console.log("[TransferService] Références créées");

  const now = Timestamp.now();
  const payload: TransferRequestDoc = {
    companyId,
    agencyId,
    fromAccountId: params.fromAccountId,
    toAccountId: params.toAccountId,
    amount,
    currency: params.currency,
    description: params.description?.trim() || null,
    bankReference: params.bankReference?.trim() || null,
    depositSlipUrl: params.depositSlipUrl?.trim() || null,
    status: "executed",
    initiatedBy,
    initiatedByRole: role ?? null,
    managerDecisionBy: null,
    managerDecisionAt: null,
    managerDecisionReason: null,
    executedBy: initiatedBy,
    executedAt: now,
    idempotencyKey: operationId,
    createdAt: now,
    updatedAt: serverTimestamp(),
  };

  console.log("[TransferService] Payload préparé:", JSON.stringify(payload, null, 2));

  console.log("[TransferService] runTransaction - DÉBUT");
  await runTransaction(db, async (tx) => {
    console.log("[TransferService] runTransaction - Transaction démarrée");

    const [cashSnap, bankSnap] = await Promise.all([
      tx.get(cashRef),
      tx.get(bankRef),
    ]);

    console.log("[TransferService] Vérification des documents existants...");
    console.log("[TransferService] cashSnap.exists:", cashSnap.exists());
    console.log("[TransferService] bankSnap.exists:", bankSnap.exists());

    if (!cashSnap.exists()) {
      console.error("[TransferService] Caisse agence introuvable");
      throw new Error("Caisse agence introuvable.");
    }

    const cash = cashSnap.data() as Record<string, unknown>;
    const bank = bankSnap.exists()
      ? (bankSnap.data() as Record<string, unknown>)
      : null;

    console.log("[TransferService] Données caisse:", JSON.stringify(cash, null, 2));
    console.log("[TransferService] Données banque:", bank ? JSON.stringify(bank, null, 2) : "null");

    if (
      cash.companyId !== companyId
      || cash.agencyId !== agencyId
      || cash.type !== "cash"
      || cash.includeInLiquidity === false
    ) {
      console.error("[TransferService] Compte caisse incohérent");
      throw new Error("Compte caisse agence incohérent.");
    }

    if (bank && (
      bank.companyId !== companyId
      || bank.type !== "bank"
      || bank.includeInLiquidity === false
      || (bank.agencyId != null && bank.agencyId !== "")
    )) {
      console.error("[TransferService] Compte bancaire incohérent");
      throw new Error("Compte bancaire compagnie incohérent.");
    }

    const previousCashBalance = Number(cash.balance);
    const previousBankBalance = bank ? Number(bank.balance) : 0;

    console.log("[TransferService] Soldes actuels:", {
      previousCashBalance,
      previousBankBalance,
      amount
    });

    if (!Number.isFinite(previousCashBalance) || !Number.isFinite(previousBankBalance)) {
      console.error("[TransferService] Solde invalide");
      throw new Error("Solde de compte invalide.");
    }

    if (previousCashBalance < amount) {
      console.error("[TransferService] Solde insuffisant:", {
        previousCashBalance,
        amount,
        difference: previousCashBalance - amount
      });
      throw new Error("Solde caisse insuffisant.");
    }

    const nextCashBalance = previousCashBalance - amount;
    const nextBankBalance = previousBankBalance + amount;

    console.log("[TransferService] Nouveaux soldes:", {
      nextCashBalance,
      nextBankBalance
    });

    const transactionPayload: FinancialTransactionDoc = {
      type: "transfer",
      source: "bank",
      amount,
      currency: params.currency,
      companyId,
      agencyId,
      reservationId: null,
      debitAccountId: fromAccountId,
      creditAccountId: toAccountId,
      debitAccountType: "cash",
      creditAccountType: "bank",
      balanceAfter: nextBankBalance,
      status: "confirmed",
      performedAt: now,
      createdAt: now,
      metadata: {
        requestId,
        performedBy: initiatedBy,
        executionMode: "agency_bank_deposit_direct",
        debitAfter: nextCashBalance,
        creditAfter: nextBankBalance,
        bankReference: params.bankReference?.trim() || null,
      },
      referenceType: "agency_deposit",
      referenceId: requestId,
      uniqueReferenceKey: operationId,
      paymentChannel: "cash",
      paymentMethod: "cash",
      paymentProvider: null,
    };

    console.log("[TransferService] tx.set() - Création de la demande...");
    tx.set(ref, payload);
    console.log("[TransferService] tx.set() - Demande créée");

    console.log("[TransferService] tx.update() - Mise à jour caisse...");
    tx.update(cashRef, {
      balance: nextCashBalance,
      updatedAt: serverTimestamp(),
      lastDirectTransferId: requestId,
    });
    console.log("[TransferService] tx.update() - Caisse mise à jour");

    if (bank) {
      console.log("[TransferService] tx.update() - Mise à jour banque...");
      tx.update(bankRef, {
        balance: nextBankBalance,
        updatedAt: serverTimestamp(),
        lastDirectTransferId: requestId,
      });
      console.log("[TransferService] tx.update() - Banque mise à jour");
    } else {
      console.log("[TransferService] tx.set() - Création du compte banque...");
      tx.set(bankRef, {
        id: toAccountId,
        companyId,
        agencyId: null,
        type: "bank",
        label: "Banque compagnie",
        balance: nextBankBalance,
        currency: params.currency,
        includeInLiquidity: true,
        lastDirectTransferId: requestId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log("[TransferService] tx.set() - Compte banque créé");
    }

    console.log("[TransferService] tx.set() - Création de la transaction financière...");
    tx.set(transactionRef, transactionPayload);
    console.log("[TransferService] tx.set() - Transaction financière créée");

    console.log("[TransferService] tx.set() - Création de l'idempotence...");
    tx.set(idempotencyRef, {
      requestId,
      transactionId: operationId,
      agencyId,
      amount,
      createdBy: initiatedBy,
      createdAt: serverTimestamp(),
    });
    console.log("[TransferService] tx.set() - Idempotence créée");

    console.log("[TransferService] runTransaction - Transaction terminée avec succès");
  });

  console.log("[TransferService] createTransferRequest - FIN SUCCÈS - Request ID:", requestId);
  return requestId;
}

export async function listTransferRequests(
  companyId: string,
  options?: {
    agencyId?: string;
    status?: TransferRequestStatus;
    statusIn?: TransferRequestStatus[];
    limitCount?: number;
  }
): Promise<(TransferRequestDoc & { id: string })[]> {
  console.log("[TransferService] listTransferRequests - Début");
  console.log("[TransferService] Options:", JSON.stringify(options, null, 2));

  const constraints: ReturnType<typeof where>[] = [];
  if (options?.agencyId) {
    constraints.push(where("agencyId", "==", options.agencyId));
    console.log("[TransferService] Filtre agencyId:", options.agencyId);
  }
  if (options?.statusIn && options.statusIn.length > 0) {
    constraints.push(where("status", "in", options.statusIn.slice(0, 10)));
    console.log("[TransferService] Filtre statusIn:", options.statusIn);
  } else if (options?.status) {
    constraints.push(where("status", "==", options.status));
    console.log("[TransferService] Filtre status:", options.status);
  }

  const q = query(
    requestsRef(companyId),
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 50)
  );

  console.log("[TransferService] Exécution de la requête...");
  const snap = await getDocs(q);
  console.log("[TransferService] Résultats trouvés:", snap.docs.length);

  const results = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TransferRequestDoc) }));
  console.log("[TransferService] listTransferRequests - Fin succès");
  return results;
}
