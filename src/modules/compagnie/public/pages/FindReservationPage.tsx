import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import ReservationStepHeader from '../components/ReservationStepHeader';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { Phone, Calendar, MapPin } from 'lucide-react';
import type { Company } from '@/types/companyTypes';
import { normalizePhone } from '@/utils/phoneUtils';

const formatCity = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type ReservationRow = {
  id: string;
  companyId: string;
  agencyId: string;
  companySlug?: string;
  depart?: string;
  arrivee?: string;
  date?: string;
  heure?: string;
  montant?: number;
  statut?: string;
  createdAt?: Timestamp | { seconds: number };
};

function getCreatedAtMs(r: ReservationRow): number {
  const c = r.createdAt;
  if (!c) return 0;
  if (c instanceof Timestamp) return c.toMillis();
  if (typeof c === 'object' && 'seconds' in c) return (c as { seconds: number }).seconds * 1000;
  return 0;
}

function formatDateHour(dateStr?: string, heureStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = heureStr ? parseISO(`${dateStr}T${heureStr}:00`) : parseISO(dateStr);
    return format(d, "d MMM yyyy à HH:mm", { locale: fr });
  } catch {
    return `${dateStr} ${heureStr || ''}`.trim();
  }
}

function StatusBadge({ statut }: { statut?: string }) {
  const s = (statut || '').toLowerCase();
  let bg = 'bg-gray-100 text-gray-800';
  let text = statut || '—';
  if (s === 'en_attente_paiement') {
    bg = 'bg-orange-100 text-orange-800';
    text = 'Paiement en attente';
  } else if (s === 'preuve_recue') {
    bg = 'bg-blue-100 text-blue-800';
    text = 'Preuve envoyée';
  } else if (s === 'paye' || s === 'confirme') {
    bg = 'bg-green-100 text-green-800';
    text = 'Billet confirmé';
  } else if (s === 'embarqué') {
    bg = 'bg-emerald-700 text-white';
    text = 'Voyage effectué';
  } else if (s === 'annule' || s === 'refuse') {
    bg = 'bg-red-100 text-red-800';
    text = s === 'annule' ? 'Annulée' : 'Refusée';
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bg}`}>
      {text}
    </span>
  );
}

interface FindReservationPageProps {
  company: Company;
}

export default function FindReservationPage({ company }: FindReservationPageProps) {
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const slug = company.slug || company.id;
  const primaryColor = company.couleurPrimaire ?? '#2563eb';
  const secondaryColor = company.couleurSecondaire ?? '#93c5fd';

  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ReservationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const search = useCallback(async () => {
    const phoneNorm = normalizePhone(phone);
    if (phoneNorm.length !== 8) {
      setError('Veuillez entrer un numéro malien valide (8 chiffres).');
      return;
    }
    setError(null);
    setLoading(true);
    setHasSearched(true);
    setResults([]);

    try {
      const agenciesSnap = await getDocs(collection(db, 'companies', company.id, 'agences'));
      const seenIds = new Set<string>();
      const out: ReservationRow[] = [];
      const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;

      const pushDoc = (d: { id: string; data: () => Record<string, unknown> }, agencyId: string) => {
        if (seenIds.has(d.id)) return;
        seenIds.add(d.id);
        const r = d.data();
        const createdAt = r.createdAt as ReservationRow['createdAt'];
        const createdAtMs = createdAt
          ? (createdAt instanceof Timestamp ? createdAt.toMillis() : (createdAt as { seconds: number }).seconds * 1000)
          : 0;
        if (createdAtMs >= sevenDaysAgo) {
          out.push({
            id: d.id,
            companyId: company.id,
            agencyId,
            companySlug: slug,
            depart: (r.depart as string) || (r.departure as string),
            arrivee: (r.arrivee as string) || (r.arrival as string),
            date: r.date as string,
            heure: r.heure as string,
            montant: (r.montant as number) ?? (r.montant_total as number),
            statut: r.statut as string,
            createdAt,
          });
        }
      };

      for (const agDoc of agenciesSnap.docs) {
        const colRef = collection(db, 'companies', company.id, 'agences', agDoc.id, 'reservations');
        const qNormalized = query(colRef, where('telephoneNormalized', '==', phoneNorm));
        const snapNormalized = await getDocs(qNormalized);
        snapNormalized.forEach((d) => pushDoc({ id: d.id, data: () => d.data() as Record<string, unknown> }, agDoc.id));
        const qLegacy = query(colRef, where('telephone', '==', phoneNorm));
        const snapLegacy = await getDocs(qLegacy);
        snapLegacy.forEach((d) => pushDoc({ id: d.id, data: () => d.data() as Record<string, unknown> }, agDoc.id));
      }

      out.sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
      setResults(out);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('Erreur lors de la recherche. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [phone, company.id, slug]);

  return (
    <div className="min-h-screen bg-gray-50">
      <ReservationStepHeader
        onBack={() => navigate(`/${slug}`)}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        title="Retrouver ma réservation"
        logoUrl={company.logoUrl}
      />

      <main className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4 -mt-2">
        <p className="text-sm text-gray-600 text-center px-2">
          Retrouvez vos réservations et billets en entrant votre numéro de téléphone.
        </p>

        {/* Form card */}
        <div
          className="relative bg-white rounded-2xl p-5 shadow-xl border"
          style={{
            borderColor: `${secondaryColor}4D`,
            boxShadow: `0 12px 25px rgba(0,0,0,0.15), 0 0 0 1px ${secondaryColor}4D`,
          }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Numéro de téléphone
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: 76499222"
                className="w-full h-12 pl-10 pr-3 border rounded-xl focus:ring-2 focus:ring-offset-0 focus:outline-none border-gray-200"
                style={{ ['--tw-ring-color' as string]: `${primaryColor}40` }}
                onKeyDown={(e) => e.key === 'Enter' && search()}
              />
            </div>
            <button
              type="button"
              onClick={search}
              disabled={loading}
              className="h-12 px-5 rounded-xl font-semibold text-white shadow-md disabled:opacity-60 transition hover:opacity-95"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                boxShadow: `0 8px 20px ${secondaryColor}55`,
              }}
            >
              {loading ? 'Recherche…' : 'Rechercher'}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Results */}
        {hasSearched && !loading && results.length > 0 && (
          <div className="space-y-3">
            {results.map((r) => (
              <div
                key={`${r.companyId}-${r.agencyId}-${r.id}`}
                className="relative bg-white rounded-2xl p-4 shadow-xl border"
                style={{
                  borderColor: `${secondaryColor}4D`,
                  boxShadow: `0 12px 25px rgba(0,0,0,0.15), 0 0 0 1px ${secondaryColor}4D`,
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" aria-hidden />
                      {formatCity(r.depart || '')} → {formatCity(r.arrivee || '')}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <Calendar className="w-3.5 h-3.5" aria-hidden />
                      {formatDateHour(r.date, r.heure)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: primaryColor }}>
                      {money(r.montant ?? 0)}
                    </div>
                    <StatusBadge statut={r.statut} />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100">
                  {(r.statut || '').toLowerCase() === 'en_attente_paiement' && (
                    <button
                      type="button"
                      onClick={() => navigate(`/${slug}/upload-preuve/${r.id}`, { replace: false })}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
                      style={{
                        background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                      }}
                    >
                      Continuer ma réservation
                    </button>
                  )}
                  {(r.statut || '').toLowerCase() === 'preuve_recue' && (
                    <p className="text-sm text-blue-700 font-medium">En attente de validation</p>
                  )}
                  {['paye', 'confirme', 'embarqué'].includes((r.statut || '').toLowerCase()) && (
                    <button
                      type="button"
                      onClick={() => navigate(`/${slug}/receipt/${r.id}`, { replace: false })}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
                      style={{
                        background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                      }}
                    >
                      Voir mon billet
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state after search */}
        {hasSearched && !loading && results.length === 0 && (
          <div
            className="rounded-2xl p-6 text-center border"
            style={{ borderColor: `${secondaryColor}4D`, backgroundColor: '#fafafa' }}
          >
            <p className="text-gray-700 font-medium">{error || 'Aucune réservation trouvée pour ce numéro.'}</p>
            <button
              type="button"
              onClick={() => navigate(`/${slug}/booking`, { replace: false })}
              className="mt-4 rounded-xl py-3 px-5 text-sm font-semibold text-white transition hover:opacity-95"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              }}
            >
              Faire une réservation
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
