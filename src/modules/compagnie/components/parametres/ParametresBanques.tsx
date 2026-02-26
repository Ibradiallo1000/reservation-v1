// Banques de la compagnie — configurées par le CEO. Les comptables d'agence vireront la caisse vers l'une de ces banques (traçabilité).
import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { useAuth } from "@/contexts/AuthContext";
import {
  listCompanyBanks,
  addCompanyBank,
  updateCompanyBank,
  deactivateCompanyBank,
  type CompanyBankDoc,
} from "@/modules/compagnie/treasury/companyBanks";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";

interface ParametresBanquesProps {
  companyId: string;
}

const ParametresBanques: React.FC<ParametresBanquesProps> = ({ companyId }) => {
  const { company } = useAuth();
  const theme = useCompanyTheme(company);
  const [banks, setBanks] = useState<(CompanyBankDoc & { id: string })[]>([]);
  const [companyCurrency, setCompanyCurrency] = useState<string>("XOF");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; iban: string; description: string }>({
    name: "",
    iban: "",
    description: "",
  });

  const loadCompanyAndBanks = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [companySnap, list] = await Promise.all([
        getDoc(doc(db, "companies", companyId)),
        listCompanyBanks(companyId),
      ]);
      if (companySnap.exists()) {
        const data = companySnap.data() as { devise?: string };
        setCompanyCurrency(data.devise || "XOF");
      }
      setBanks(list);
    } catch (e) {
      console.error(e);
      setError("Impossible de charger les banques.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanyAndBanks();
  }, [companyId]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", iban: "", description: "" });
    setModalOpen(true);
  };

  const openEdit = (bank: CompanyBankDoc & { id: string }) => {
    setEditingId(bank.id!);
    setForm({
      name: bank.name,
      iban: bank.iban || "",
      description: bank.description || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        await updateCompanyBank(companyId, editingId, {
          name: form.name.trim(),
          iban: form.iban.trim() || null,
          description: form.description.trim() || null,
        });
        setSuccess("Banque mise à jour.");
      } else {
        await addCompanyBank(companyId, {
          name: form.name.trim(),
          iban: form.iban.trim() || null,
          description: form.description.trim() || null,
          currency: companyCurrency,
          isActive: true,
        });
        setSuccess("Banque ajoutée.");
      }
      setModalOpen(false);
      await loadCompanyAndBanks();
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'enregistrement.");
    }
  };

  const handleDeactivate = async (bankId: string, name: string) => {
    if (!window.confirm(`Désactiver la banque « ${name} » ? Les comptables ne pourront plus la sélectionner pour de nouveaux virements.`)) return;
    setError(null);
    try {
      await deactivateCompanyBank(companyId, bankId);
      setSuccess("Banque désactivée.");
      await loadCompanyAndBanks();
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la désactivation.");
    }
  };

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-gray-600 mb-6">
        Les banques définies ici sont au niveau de la compagnie. Les comptables des agences pourront choisir l'une d'elles lors d'un <strong>transfert caisse → banque</strong>, afin d'assurer la traçabilité des fonds.
      </p>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          {success}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Banques de la compagnie</h3>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm"
          style={{ backgroundColor: theme.colors.primary }}
        >
          <Plus className="w-4 h-4" />
          Ajouter une banque
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500">Chargement…</div>
      ) : banks.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Aucune banque configurée. Ajoutez les comptes bancaires de la compagnie pour que les comptables d'agence puissent enregistrer les virements caisse → banque.
        </div>
      ) : (
        <ul className="space-y-3">
          {banks.map((bank) => (
            <li
              key={bank.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: theme.colors.primary }}
                >
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{bank.name}</div>
                  {bank.iban && <div className="text-sm text-gray-500">{bank.iban}</div>}
                  {bank.description && <div className="text-sm text-gray-400">{bank.description}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(bank)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  title="Modifier"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeactivate(bank.id!, bank.name)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
                  title="Désactiver"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? "Modifier la banque" : "Ajouter une banque"}
            </h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la banque *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-offset-0"
                  style={{ outlineColor: theme.colors.primary }}
                  placeholder="Ex: BICIS - Compte principal"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IBAN (optionnel)</label>
                <input
                  type="text"
                  value={form.iban}
                  onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-offset-0"
                  style={{ outlineColor: theme.colors.primary }}
                  placeholder="Ex: SN12 1234 5678 9012 3456 7890 123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optionnel)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-offset-0"
                  style={{ outlineColor: theme.colors.primary }}
                  placeholder="Ex: Compte principal siège"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg text-white font-medium"
                  style={{ backgroundColor: theme.colors.primary }}
                >
                  {editingId ? "Enregistrer" : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParametresBanques;
