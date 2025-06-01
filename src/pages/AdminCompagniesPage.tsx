import React, { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import AdminAjouterCompagnie from './AdminAjouterCompagnie';

const AdminCompagniesPage: React.FC = () => {
  const [compagnies, setCompagnies] = useState<any[]>([]);
  const [selectedCompagnieId, setSelectedCompagnieId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [message, setMessage] = useState('');

  const fetchCompagnies = async () => {
    const snapshot = await getDocs(collection(db, 'companies'));
    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    setCompagnies(data);
  };

  useEffect(() => {
    fetchCompagnies();
  }, []);

  const handleDelete = async (id: string) => {
    const confirmation = window.confirm('Voulez-vous vraiment supprimer cette compagnie ? Cette action est irréversible.');
    if (!confirmation) return;
    try {
      await deleteDoc(doc(db, 'companies', id));
      setMessage('Compagnie supprimée.');
      setSelectedCompagnieId(null);
      fetchCompagnies();
    } catch (error) {
      console.error('Erreur suppression :', error);
      setMessage('Erreur lors de la suppression.');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'actif' ? 'inactif' : 'actif';
    try {
      await updateDoc(doc(db, 'compagnies', id), { status: newStatus });
      setMessage(`Statut mis à jour en "${newStatus}".`);
      setSelectedCompagnieId(null);
      fetchCompagnies();
    } catch (error) {
      console.error('Erreur statut :', error);
      setMessage('Erreur mise à jour du statut.');
    }
  };

  const handleEdit = (compagnie: any) => {
    setEditingId(compagnie.id);
    setFormData({ ...compagnie });
  };

  const handleUpdate = async () => {
    try {
      await updateDoc(doc(db, 'compagnies', editingId!), formData);
      setMessage('Compagnie mise à jour.');
      setEditingId(null);
      setSelectedCompagnieId(null);
      fetchCompagnies();
    } catch (error) {
      console.error('Erreur mise à jour :', error);
      setMessage('Erreur lors de la mise à jour.');
    }
  };

  const toggleDetails = (id: string) => {
    setSelectedCompagnieId(selectedCompagnieId === id ? null : id);
  };

  return (
    <div className="flex gap-8 p-6">
      <div className="w-1/2">
        <AdminAjouterCompagnie onSuccess={fetchCompagnies} />
      </div>

      <div className="w-1/2">
        <h2 className="text-lg font-bold mb-4">Compagnies enregistrées</h2>
        {compagnies.map((c) => (
          <div key={c.id} className="border p-4 mb-3 rounded shadow">
            <p className="font-semibold cursor-pointer" onClick={() => toggleDetails(c.id)}>
              {c.nom} {selectedCompagnieId === c.id && <span className="text-sm text-gray-500">(cliquez pour replier)</span>}
            </p>
            {selectedCompagnieId === c.id && (
              editingId === c.id ? (
                <div>
                  <input className="border px-2 py-1 w-full mb-1" value={formData.nom || ''} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} placeholder="Nom" />
                  <input className="border px-2 py-1 w-full mb-1" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Email" />
                  <input className="border px-2 py-1 w-full mb-1" value={formData.telephone || ''} onChange={(e) => setFormData({ ...formData, telephone: e.target.value })} placeholder="Téléphone" />
                  <input className="border px-2 py-1 w-full mb-1" value={formData.pays || ''} onChange={(e) => setFormData({ ...formData, pays: e.target.value })} placeholder="Pays" />
                  <select className="border px-2 py-1 w-full mb-1" value={formData.plan || 'free'} onChange={(e) => setFormData({ ...formData, plan: e.target.value })}>
                    <option value="free">Gratuit</option>
                    <option value="pro">Pro</option>
                    <option value="premium">Premium</option>
                  </select>
                  <input className="border px-2 py-1 w-full mb-1" value={formData.slug || ''} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} placeholder="Slug (ex: bamabus)" />
                  <input type="number" step="0.01" min={0} max={1} className="border px-2 py-1 w-full mb-2" value={formData.commissionRate || ''} onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) })} placeholder="Commission (ex: 0.05)" />

                  <button onClick={handleUpdate} className="mr-2 text-sm px-3 py-1 rounded bg-green-500 text-white hover:bg-green-600">Enregistrer</button>
                  <button onClick={() => setEditingId(null)} className="text-sm px-3 py-1 rounded bg-gray-400 text-white hover:bg-gray-500">Annuler</button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600">Email : {c.email || 'Non défini'}</p>
                  <p className="text-sm text-gray-600">Téléphone : {c.telephone || 'Non défini'}</p>
                  <p className="text-sm text-gray-600">Pays : {c.pays || 'Non défini'}</p>
                  <p className={`text-sm ${c.status === 'inactif' ? 'text-red-600' : 'text-green-600'}`}>Statut : {c.status || 'actif'}</p>
                  <p className="text-sm text-gray-600">Plan : {c.plan || 'free'}</p>
                  <p className="text-sm text-gray-600">Slug : {c.slug || '—'}</p>
                  <p className="text-sm text-gray-600">Commission : {(c.commissionRate || 0.05) * 100}%</p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleEdit(c)} className="text-sm px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600">Modifier</button>
                    <button onClick={() => handleToggleStatus(c.id, c.status || 'actif')} className="text-sm px-3 py-1 rounded bg-yellow-400 text-white hover:bg-yellow-500">
                      {c.status === 'inactif' ? 'Réactiver' : 'Désactiver'}
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-sm px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600">Supprimer</button>
                  </div>
                </div>
              )
            )}
          </div>
        ))}
        {message && <p className="mt-4 text-blue-600">{message}</p>}
      </div>
    </div>
  );
};

export default AdminCompagniesPage;
