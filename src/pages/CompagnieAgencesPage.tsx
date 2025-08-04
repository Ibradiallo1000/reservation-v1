import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';

// Configuration des icônes Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});

interface Agence {
  id?: string;
  nomAgence: string;
  ville: string;
  pays: string;
  quartier?: string;
  type?: string;
  statut: 'active' | 'inactive';
  emailGerant: string;
  nomGerant: string;
  telephone: string;
  latitude?: number | null;
  longitude?: number | null;
}

const CompagnieAgencesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agences, setAgences] = useState<Agence[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nomAgence: '',
    ville: '',
    pays: '',
    quartier: '',
    type: '',
    emailGerant: '',
    nomGerant: '',
    telephone: '',
    motDePasse: '',
    latitude: '',
    longitude: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [isEmailChecking, setIsEmailChecking] = useState(false);
  const [emailError, setEmailError] = useState('');

  const couleurPrincipale = user?.companyColor || '#2563eb';

  const MapClickHandler = ({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) => {
    useMapEvents({
      click(e) {
        onPositionChange(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };

  const fetchAgences = async () => {
    if (!user?.companyId) return;
    
    try {
      const agencesRef = collection(db, 'companies', user.companyId, 'agences');
      const snap = await getDocs(agencesRef);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Agence[];
      setAgences(list);
      setCurrentPage(1);
    } catch (error) {
      console.error("Erreur lors du chargement des agences:", error);
      alert("Une erreur est survenue lors du chargement des agences");
    }
  };

  const checkEmailExists = async (email: string): Promise<boolean> => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Erreur lors de la vérification de l'email:", error);
      return false;
    }
  };

  useEffect(() => {
    fetchAgences();
  }, [user]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAgences = agences.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(agences.length / itemsPerPage);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    if (name === 'emailGerant') {
      setEmailError('');
    }
  };

  const handlePositionChange = (lat: number, lng: number) => {
    setFormData(prev => ({
      ...prev,
      latitude: lat.toString(),
      longitude: lng.toString()
    }));
  };

  const resetForm = () => {
    setFormData({
      nomAgence: '',
      ville: '',
      pays: '',
      quartier: '',
      type: '',
      emailGerant: '',
      nomGerant: '',
      telephone: '',
      motDePasse: '',
      latitude: '',
      longitude: '',
    });
    setEditingId(null);
    setShowForm(false);
    setEmailError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  console.log("📤 Soumission du formulaire", formData);

  try {
    if (!user?.companyId) {
      throw new Error("Aucune compagnie associée à cet utilisateur");
    }

    if (!editingId) {
      console.log("🔍 Vérification email déjà utilisé...");
      setIsEmailChecking(true);
      const emailExists = await checkEmailExists(formData.emailGerant);
      setIsEmailChecking(false);
      if (emailExists) {
        console.warn("❌ Email déjà utilisé :", formData.emailGerant);
        setEmailError("Cet email est déjà utilisé par un autre utilisateur");
        return;
      }

      if (!formData.motDePasse || formData.motDePasse.length < 6) {
        console.warn("❌ Mot de passe trop court ou manquant");
        alert("Le mot de passe doit contenir au moins 6 caractères.");
        return;
      }
    }

    if (editingId) {
      console.log("✏️ Mise à jour agence...");
      const agenceRef = doc(db, 'companies', user.companyId, 'agences', editingId);
      await updateDoc(agenceRef, {
        nomAgence: formData.nomAgence,
        ville: formData.ville,
        pays: formData.pays,
        quartier: formData.quartier,
        type: formData.type,
        nomGerant: formData.nomGerant,
        telephone: formData.telephone,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      });
      alert('✅ Agence mise à jour avec succès');
    } else {
      console.log("👤 Création utilisateur Firebase Auth...");
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.emailGerant,
        formData.motDePasse
      );
      console.log("✅ Utilisateur créé :", userCredential.user.uid);

      console.log("🏢 Ajout de l’agence Firestore...");
      const agencesRef = collection(db, 'companies', user.companyId, 'agences');
      const agenceRef = await addDoc(agencesRef, {
        nomAgence: formData.nomAgence,
        ville: formData.ville,
        pays: formData.pays,
        quartier: formData.quartier,
        type: formData.type,
        statut: 'active',
        emailGerant: formData.emailGerant,
        nomGerant: formData.nomGerant,
        telephone: formData.telephone,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      });

      console.log("📦 Mise à jour collection users...");
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: formData.emailGerant,
        nom: formData.nomGerant,
        telephone: formData.telephone,
        role: 'chefAgence',
        companyId: user.companyId,
        agencyId: agenceRef.id,
      });

      alert('✅ Agence et gérant créés avec succès');
    }

    resetForm();
    fetchAgences();
  } catch (err: any) {
    console.error("🔥 Erreur pendant handleSubmit:", err);
    alert(`Erreur: ${err?.message ?? err?.code ?? 'Erreur inconnue'}`);
  }
};

  const handleEdit = (agence: Agence) => {
    setFormData({
      nomAgence: agence.nomAgence,
      ville: agence.ville,
      pays: agence.pays,
      quartier: agence.quartier || '',
      type: agence.type || '',
      emailGerant: agence.emailGerant,
      nomGerant: agence.nomGerant,
      telephone: agence.telephone,
      motDePasse: '',
      latitude: agence.latitude?.toString() || '',
      longitude: agence.longitude?.toString() || '',
    });
    setEditingId(agence.id!);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!user?.companyId) return;
    
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette agence ?')) {
      try {
        await deleteDoc(doc(db, 'companies', user.companyId, 'agences', id));
        fetchAgences();
      } catch (error) {
        console.error("Erreur lors de la suppression:", error);
        alert("Une erreur est survenue lors de la suppression");
      }
    }
  };

  const handleToggleStatut = async (agence: Agence) => {
    if (!user?.companyId || !agence.id) return;
    
    const newStatut = agence.statut === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'companies', user.companyId, 'agences', agence.id), { 
        statut: newStatut 
      });
      fetchAgences();
    } catch (error) {
      console.error("Erreur lors du changement de statut:", error);
      alert("Une erreur est survenue lors du changement de statut");
    }
  };

  const goToDashboard = (agencyId: string) => {
    navigate(`/compagnie/agence/${agencyId}/dashboard`);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold" style={{ color: couleurPrincipale }}>
          Gestion des agences
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center px-4 py-2 rounded-md shadow-sm text-white font-medium"
          style={{ backgroundColor: couleurPrincipale }}
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {showForm ? 'Masquer le formulaire' : 'Ajouter une nouvelle agence'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md mb-8 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4" style={{ color: couleurPrincipale }}>
            {editingId ? 'Modifier une agence' : 'Ajouter une nouvelle agence'}
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom de l'agence *</label>
                <input
                  name="nomAgence"
                  value={formData.nomAgence}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Ville *</label>
                <input
                  name="ville"
                  value={formData.ville}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Pays *</label>
                <input
                  name="pays"
                  value={formData.pays}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Quartier</label>
                <input
                  name="quartier"
                  value={formData.quartier}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <input
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom du gérant *</label>
                <input
                  name="nomGerant"
                  value={formData.nomGerant}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email du gérant *</label>
                <input
                  name="emailGerant"
                  type="email"
                  value={formData.emailGerant}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {editingId ? 'Nouveau mot de passe' : 'Mot de passe *'}
                </label>
                <input
                  name="motDePasse"
                  type="password"
                  value={formData.motDePasse}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={!editingId}
                  placeholder={editingId ? 'Laisser vide pour ne pas changer' : ''}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Téléphone *</label>
                <input
                  name="telephone"
                  value={formData.telephone}
                  onChange={handleInputChange}
                  className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium mb-1">
              📍 Position géographique {formData.latitude && formData.longitude && (
                <span className="text-gray-500 ml-2">
                  ({formData.latitude}, {formData.longitude})
                </span>
              )}
            </label>
            <p className="text-sm text-gray-500 mb-2">Cliquez sur la carte pour positionner l'agence</p>
            <div className="h-64 rounded-lg border border-gray-300 overflow-hidden">
              <MapContainer
                center={[
                  formData.latitude ? parseFloat(formData.latitude) : 12.6392, 
                  formData.longitude ? parseFloat(formData.longitude) : -8.0029
                ]}
                zoom={formData.latitude ? 15 : 12}
                className="h-full w-full"
                scrollWheelZoom={true}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClickHandler onPositionChange={handlePositionChange} />
                {formData.latitude && formData.longitude && (
                  <Marker position={[
                    parseFloat(formData.latitude), 
                    parseFloat(formData.longitude)
                  ]} />
                )}
              </MapContainer>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white hover:bg-opacity-90"
              style={{ backgroundColor: couleurPrincipale }}
            >
              {editingId ? 'Mettre à jour l\'agence' : 'Ajouter l\'agence'}
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Liste des agences ({agences.length})</h3>
        <div className="flex items-center">
          <label className="mr-2 text-sm">Agences par page:</label>
          <select 
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="border rounded p-1 text-sm"
          >
            <option value={6}>6</option>
            <option value={12}>12</option>
            <option value={24}>24</option>
          </select>
        </div>
      </div>
      
      {agences.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900">Aucune agence enregistrée</h3>
          <p className="mt-1 text-sm text-gray-500">Commencez par ajouter votre première agence.</p>
          <div className="mt-6">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white"
              style={{ backgroundColor: couleurPrincipale }}
            >
              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Ajouter une agence
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentAgences.map(ag => (
              <div key={ag.id} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200 hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-1">{ag.nomAgence}</h3>
                      <p className="text-sm text-gray-500">{ag.ville}, {ag.pays}</p>
                    </div>
                    <span 
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ag.statut === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {ag.statut === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <div className="flex items-center text-sm text-gray-500 mb-2">
                      <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {ag.emailGerant}
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {ag.telephone}
                    </div>
                  </div>

                  <div className="mt-5 flex justify-between space-x-2">
                    <button
                      onClick={() => goToDashboard(ag.id!)}
                      className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <svg className="-ml-1 mr-2 h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Dashboard
                    </button>
                    <button
                      onClick={() => handleEdit(ag)}
                      className="inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white"
                      style={{ backgroundColor: couleurPrincipale }}
                    >
                      <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Modifier
                    </button>
                  </div>

                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => handleToggleStatut(ag)}
                      className={`flex-1 px-3 py-2 border rounded-md text-sm font-medium ${
                        ag.statut === 'active' 
                          ? 'border-yellow-300 text-yellow-700 bg-yellow-100 hover:bg-yellow-200' 
                          : 'border-green-300 text-green-700 bg-green-100 hover:bg-green-200'
                      }`}
                    >
                      {ag.statut === 'active' ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      onClick={() => handleDelete(ag.id!)}
                      className="flex-1 px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {agences.length > itemsPerPage && (
            <div className="flex justify-between items-center mt-6">
              <div className="text-sm text-gray-500">
                Affichage {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, agences.length)} sur {agences.length} agences
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className={`px-4 py-2 rounded-md ${currentPage === 1 ? 
                    'bg-gray-200 text-gray-500 cursor-not-allowed' : 
                    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  Précédent
                </button>
                <span className="px-4 py-2 text-gray-700">
                  Page {currentPage} sur {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`px-4 py-2 rounded-md ${
                    currentPage === totalPages ? 
                    'bg-gray-200 text-gray-500 cursor-not-allowed' : 
                    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CompagnieAgencesPage;