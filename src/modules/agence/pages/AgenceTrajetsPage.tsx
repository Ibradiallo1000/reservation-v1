import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { generateWeeklyTrips } from '@/modules/agence/services/generateWeeklyTrips';
import { useAuth } from '@/contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import VilleInput from '@/modules/agence/components/form/VilleInput';
import { ajouterVillesDepuisTrajet } from '@/modules/agence/utils/updateVilles';
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton } from '@/ui';
import { useFormatCurrency, useCurrencySymbol } from '@/shared/currency/CurrencyContext';
import { Route, FileDown } from 'lucide-react';

const joursDeLaSemaine = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  price: number;
  places?: number;
  horaires: { [key: string]: string[] };
  active: boolean;
  createdAt?: Timestamp;
}

const AgenceTrajetsPage: React.FC = () => {
  const { user, company } = useAuth();
  const money = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [price, setPrice] = useState('');
  const [places, setPlaces] = useState('');
  const [horaires, setHoraires] = useState<{ [key: string]: string[] }>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [trajets, setTrajets] = useState<WeeklyTrip[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modifierId, setModifierId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtreJour, setFiltreJour] = useState('');
  const [page, setPage] = useState(1);
  const [accesRefuse, setAccesRefuse] = useState(false);
  const itemsPerPage = 10;

  const theme = {
    primary: company?.couleurPrimaire || '#06b6d4',
    secondary: company?.couleurSecondaire || '#8b5cf6',
  };

  // Vérifier les permissions d'accès
  useEffect(() => {
    if (user?.role) {
      const peutGererTrajets = ['admin_platforme', 'admin_compagnie', 'chefAgence'].includes(user.role);
      if (!peutGererTrajets) {
        setAccesRefuse(true);
        setMessage('❌ Accès refusé : seuls les administrateurs et chefs d\'agence peuvent gérer les trajets.');
      } else {
        setAccesRefuse(false);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!accesRefuse && user?.companyId && user?.agencyId) {
      fetchTrajets();
    }
  }, [user, page, search, filtreJour, accesRefuse]);

  const fetchTrajets = async () => {
    if (!user?.companyId || !user?.agencyId) return;
    const q = query(
      collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'weeklyTrips')
    );
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as WeeklyTrip[];
    const sorted = data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const filtered = sorted.filter(t =>
      (t.departure.toLowerCase().includes(search.toLowerCase()) ||
        t.arrival.toLowerCase().includes(search.toLowerCase())) &&
      (filtreJour === '' || (t.horaires?.[filtreJour]?.length > 0))
    );
    const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    setTrajets(paginated);
  };

  const supprimerTrajet = async (id: string) => {
    if (!user?.companyId || !user?.agencyId) return;
    if (!confirm('Voulez-vous vraiment supprimer ce trajet ?')) return;
    
    setLoading(true);
    try {
      await deleteDoc(
        doc(db, 'companies', user.companyId, 'agences', user.agencyId, 'weeklyTrips', id)
      );
      fetchTrajets();
      setMessage('🗑️ Trajet supprimé avec succès.');
    } catch (err) {
      console.error(err);
      setMessage("❌ Erreur lors de la suppression du trajet.");
    } finally {
      setLoading(false);
    }
  };

  const handleHoraireChange = (day: string, index: number, value: string) => {
    setHoraires(prev => {
      const copy = { ...prev };
      if (!copy[day]) copy[day] = [];
      copy[day][index] = value;
      return copy;
    });
  };

  const addHoraire = (day: string) => {
    setHoraires(prev => ({ ...prev, [day]: [...(prev[day] || []), ''] }));
  };

  const removeHoraire = (day: string, index: number) => {
    setHoraires(prev => {
      const copy = { ...prev };
      if (!copy[day]) return prev;
      copy[day].splice(index, 1);
      return copy;
    });
  };

  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

  const resetForm = () => {
    setDeparture('');
    setArrival('');
    setPrice('');
    setPlaces('');
    setHoraires({});
    setModifierId(null);
  };

  const exporterPDF = () => {
    const doc = new jsPDF();
    doc.text('Liste des trajets', 14, 14);
    autoTable(doc, {
      head: [['Départ', 'Arrivée', 'Prix', 'Places']],
      body: trajets.map(t => [t.departure, t.arrival, money(t.price), t.places || '']),
    });
    doc.save('trajets_agence.pdf');
  };

  const handleSubmit = async () => {
    // Vérifier les permissions avant toute action
    const peutCreerTrajets = ['admin_platforme', 'admin_compagnie', 'chefAgence'].includes(user?.role || '');
    
    if (!peutCreerTrajets) {
      return setMessage('❌ Permission insuffisante pour cette action.');
    }

    if (!user?.companyId || !user?.agencyId) {
      return setMessage('❌ Agence non reconnue. Reconnectez-vous.');
    }

    setLoading(true);
    setMessage('');

    const horairesFiltres: { [key: string]: string[] } = {};
    for (const jour in horaires) {
      const heuresValides = horaires[jour].filter(h => h && h.trim() !== '');
      if (heuresValides.length > 0) horairesFiltres[jour] = heuresValides;
    }

    const dep = capitalize(departure.trim());
    const arr = capitalize(arrival.trim());

    if (!dep || !arr || !price.trim() || !places.trim() || Object.keys(horairesFiltres).length === 0) {
      setLoading(false);
      return setMessage('⚠️ Tous les champs sont obligatoires (départ, arrivée, prix, places et au moins un horaire).');
    }

    try {
      if (modifierId) {
        await updateDoc(
          doc(db, 'companies', user.companyId, 'agences', user.agencyId, 'weeklyTrips', modifierId),
          {
            departure: dep,
            arrival: arr,
            price: parseInt(price),
            places: parseInt(places),
            horaires: horairesFiltres,
          }
        );
        setMessage('✅ Trajet modifié avec succès.');
      } else {
        const newTripId = await generateWeeklyTrips(
          user.companyId,
          dep,
          arr,
          parseInt(price),
          horairesFiltres,
          parseInt(places),
          user.agencyId
        );
        await ajouterVillesDepuisTrajet(dep, arr);
        setMessage('✅ Trajet ajouté avec succès !');
      }
      resetForm();
      fetchTrajets();
    } catch (error: any) {
      console.error("Erreur Firebase:", error);
      if (error.code === 'permission-denied') {
        setMessage("❌ Permission refusée. Vérifiez que votre rôle (chefAgence) est correctement configuré.");
      } else {
        setMessage("❌ Erreur lors de l'enregistrement. Vérifiez la console.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (accesRefuse) {
    return (
      <StandardLayoutWrapper maxWidthClass="max-w-md">
        <SectionCard title="Accès Refusé">
          <p className="text-gray-600 mb-2">
            Vous n'avez pas les permissions nécessaires pour accéder à cette page.
          </p>
          <p className="text-sm text-gray-500">
            Seuls les administrateurs et chefs d'agence peuvent gérer les trajets.
          </p>
        </SectionCard>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Gestion des Trajets"
        subtitle={`Connecté en tant que ${user?.role ?? "—"}`}
        icon={Route}
        primaryColorVar={theme.primary}
        right={
          <ActionButton onClick={exporterPDF} disabled={trajets.length === 0}>
            Exporter la liste
          </ActionButton>
        }
      />

      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title={modifierId ? "Modifier le trajet" : "Ajouter un trajet"}>
          <VilleInput label="Ville de départ" value={departure} onChange={setDeparture} />
          <VilleInput label="Ville d'arrivée" value={arrival} onChange={setArrival} />
          <input 
            type="number" 
            placeholder={`Prix (${currencySymbol})`} 
            value={price} 
            onChange={e => setPrice(e.target.value)}
            className="border p-2 w-full rounded mb-3" 
            min="0"
          />
          <input 
            type="number" 
            placeholder="Nombre de places" 
            value={places} 
            onChange={e => setPlaces(e.target.value)}
            className="border p-2 w-full rounded mb-4" 
            min="1" 
          />

          {joursDeLaSemaine.map(jour => (
            <div key={jour} className="mb-2">
              <p className="font-semibold">{capitalize(jour)} :</p>
              {(horaires[jour] || []).map((h, i) => (
                <div key={i} className="flex gap-2 my-1">
                  <input 
                    type="time" 
                    value={h} 
                    onChange={e => handleHoraireChange(jour, i, e.target.value)} 
                    className="border p-1 rounded flex-grow" 
                  />
                  <button 
                    type="button" 
                    onClick={() => removeHoraire(jour, i)} 
                    className="text-red-600 hover:bg-red-50 px-2 rounded"
                  >
                    ×
                  </button>
                </div>
              ))}
              <ActionButton
                type="button"
                onClick={() => addHoraire(jour)}
                size="sm"
                className="mt-1"
              >
                + Ajouter un horaire
              </ActionButton>
            </div>
          ))}

          <ActionButton 
            onClick={handleSubmit} 
            disabled={loading}
            className="mt-4 w-full"
          >
            {loading ? '⏳ En cours...' : modifierId ? 'Mettre à jour' : 'Enregistrer le trajet'}
          </ActionButton>

          {message && (
            <p className={`mt-2 p-3 rounded ${message.includes('❌') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
              {message}
            </p>
          )}

          {modifierId && (
            <button 
              onClick={resetForm}
              className="mt-2 px-4 py-2 bg-gray-500 hover:bg-gray-700 text-white rounded w-full"
            >
              Annuler la modification
            </button>
          )}
        </SectionCard>

        <SectionCard title="Liste des trajets">
          
          {/* Filtres */}
          <div className="flex gap-2 mb-4">
            <input 
              type="text" 
              placeholder="Rechercher par ville..." 
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="border p-2 w-full rounded"
            />
            <select 
              value={filtreJour}
              onChange={e => { setFiltreJour(e.target.value); setPage(1); }}
              className="border p-2 rounded"
            >
              <option value="">Tous les jours</option>
              {joursDeLaSemaine.map(jour => (
                <option key={jour} value={jour}>{capitalize(jour)}</option>
              ))}
            </select>
          </div>

          {/* Pagination */}
          {trajets.length > itemsPerPage && (
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                Précédent
              </button>
              <span>Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={trajets.length < itemsPerPage}
                className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          )}

          {/* Liste */}
          {trajets.length > 0 ? (
            trajets.map(t => (
              <div key={t.id} className="border rounded p-3 mb-2 shadow hover:shadow-md transition-shadow">
                <div 
                  className={`cursor-pointer font-semibold flex justify-between items-center ${t.active ? 'text-green-700' : 'text-red-500'}`}
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  <span>{t.departure} → {t.arrival} • {money(t.price)}</span>
                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {t.active ? '🟢 Actif' : '🔴 Inactif'}
                  </span>
                </div>
                {expandedId === t.id && (
                  <div className="mt-2 text-sm space-y-2">
                    <p><strong>Places :</strong> {t.places || 'Non spécifié'}</p>
                    <div>
                      <strong>Horaires :</strong>
                      {joursDeLaSemaine.map(jour => {
                        const heures = t.horaires?.[jour];
                        if (!heures?.length) return null;
                        return (
                          <p key={jour} className="ml-2">
                            {capitalize(jour)} : {heures.sort().join(', ')}
                          </p>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <button 
                        onClick={() => supprimerTrajet(t.id)} 
                        disabled={loading} 
                        className="bg-red-600 hover:bg-red-800 text-white px-3 py-1 rounded text-sm"
                      >
                        Supprimer
                      </button>
                      <button 
                        onClick={() => { 
                          setModifierId(t.id); 
                          setDeparture(t.departure); 
                          setArrival(t.arrival); 
                          setPrice(t.price.toString()); 
                          setPlaces((t.places || '').toString()); 
                          setHoraires(t.horaires); 
                        }} 
                        disabled={loading}
                        className="bg-yellow-500 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm"
                      >
                        Modifier
                      </button>
                      <ActionButton
                        onClick={async () => {
                          if (!user?.companyId || !user?.agencyId) {
                            alert("Votre session a expiré. Merci de vous reconnecter.");
                            return;
                          }
                          try {
                            await updateDoc(
                              doc(
                                db,
                                'companies',
                                user.companyId,
                                'agences',
                                user.agencyId,
                                'weeklyTrips',
                                t.id
                              ),
                              { active: !t.active }
                            );
                            fetchTrajets();
                          } catch (error) {
                            console.error("Erreur lors du changement d'état:", error);
                          }
                        }}
                        disabled={loading}
                        variant={t.active ? "secondary" : "primary"}
                        size="sm"
                      >
                        {t.active ? 'Désactiver' : 'Activer'}
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-gray-500 italic p-4 border rounded text-center">
              {loading ? 'Chargement...' : 'Aucun trajet disponible'}
            </div>
          )}
        </SectionCard>
      </div>
    </StandardLayoutWrapper>
  );
};

export default AgenceTrajetsPage;