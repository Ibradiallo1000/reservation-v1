// src/utils/tickets.ts
// Génération de références basée sur timestamp + random
// Évite complètement les appels Firestore pour éliminer les erreurs 429

function normalize(s?: string) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function inferAgencyCode(agencyName?: string) {
  const n = normalize(agencyName);
  if (!n) return '';
  // "Agence Principale", "Agence principal", "Principal(e)" => AP
  if (/(agence\s*)?principal(e)?/.test(n)) return 'AP';
  // sinon, initiales (deux premières lettres significatives)
  const initials = n
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return initials.slice(0, 2);
}

/**
 * Génère un code de référence unique sans appel Firestore
 * Format: COMPANYCODE-AGENCYCODE-SELLERCODE-XXXX
 * où XXXX = 4 chiffres basés sur timestamp + random
 * 
 * Exemple: MT-AP-WEB-1234
 */
export async function generateReferenceCodeForTripInstance(opts: {
  companyId: string;      // Non utilisé mais gardé pour compatibilité
  companyCode: string;
  agencyId: string;       // Non utilisé mais gardé pour compatibilité
  agencyCode?: string;
  agencyName?: string;
  tripInstanceId: string; // Non utilisé mais gardé pour compatibilité
  sellerCode: string;
}) {
  const {
    companyCode,
    agencyCode,
    agencyName,
    sellerCode
  } = opts;

  // Déterminer le code agence
  const agencyCodeEff = (agencyCode && agencyCode.trim())
    ? agencyCode.toUpperCase()
    : inferAgencyCode(agencyName) || 'AG';

  // Générer un séquence unique basée sur timestamp + random
  // timestamp: les 6 derniers chiffres du timestamp
  const timestamp = Date.now().toString().slice(-6);
  // random: 4 chiffres aléatoires
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  // Prendre les 4 derniers caractères de la combinaison timestamp+random
  const sequence = `${timestamp}${random}`.slice(-4);
  
  // Format final: COMPANYCODE-AGENCYCODE-SELLERCODE-SEQUENCE
  return `${companyCode.toUpperCase()}-${agencyCodeEff}-${sellerCode}-${sequence}`;
}

/**
 * Variante dédiée au web (client en ligne)
 * SellerCode = "WEB"
 */
export async function generateWebReferenceCode(args: {
  companyId: string;
  companyCode: string;
  agencyId: string;
  agencyCode?: string;
  agencyName?: string;
  tripInstanceId: string;
}) {
  return generateReferenceCodeForTripInstance({
    ...args,
    sellerCode: 'WEB',
  });
}

/**
 * Version synchrone pour utilisation sans await (si besoin)
 */
export function generateReferenceCodeSync(opts: {
  companyCode: string;
  agencyCode?: string;
  agencyName?: string;
  sellerCode: string;
}) {
  const { companyCode, agencyCode, agencyName, sellerCode } = opts;
  
  const agencyCodeEff = (agencyCode && agencyCode.trim())
    ? agencyCode.toUpperCase()
    : inferAgencyCode(agencyName) || 'AG';
  
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const sequence = `${timestamp}${random}`.slice(-4);
  
  return `${companyCode.toUpperCase()}-${agencyCodeEff}-${sellerCode}-${sequence}`;
}