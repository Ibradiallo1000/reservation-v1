import React, { useCallback, useEffect, useState } from "react";
import { deleteField, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { SectionCard } from "@/ui";
import { Button } from "@/shared/ui/button";
import {
  COURIER_SHIPMENT_REFERENCE_PREFIX_MAX_LEN,
  DEFAULT_COURIER_SHIPMENT_REFERENCE_PREFIX,
  normalizeCourierShipmentReferencePrefix,
} from "@/modules/logistics/utils/courierShipmentReferencePrefix";
import { Package, Save } from "lucide-react";

interface Props {
  companyId: string;
}

/**
 * Préfixe configurable des références envoi colis (aperçu ticket avant synchro, hors ligne).
 */
const ParametresCourierColis: React.FC<Props> = ({ companyId }) => {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" | "" }>({ text: "", tone: "" });

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "companies", companyId));
      const raw = snap.exists() ? String((snap.data() as { courierShipmentReferencePrefix?: string }).courierShipmentReferencePrefix ?? "") : "";
      setDraft(raw.trim());
    } catch {
      setDraft("");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const effective = normalizeCourierShipmentReferencePrefix(draft || undefined);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    setMessage({ text: "", tone: "" });
    try {
      const trimmed = draft.trim();
      if (!trimmed) {
        await updateDoc(doc(db, "companies", companyId), {
          courierShipmentReferencePrefix: deleteField(),
        });
      } else {
        const normalized = normalizeCourierShipmentReferencePrefix(trimmed);
        await updateDoc(doc(db, "companies", companyId), {
          courierShipmentReferencePrefix: normalized,
        });
        setDraft(normalized);
      }
      setMessage({ text: "Enregistré.", tone: "ok" });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erreur d'enregistrement.", tone: "err" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Courrier & colis" className="max-w-xl">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
          <Package className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Préfixe des références affichées sur reçus et étiquettes (ex. lors de la création d&apos;un envoi, avant
            attribution du numéro définitif). Format :{" "}
            <span className="font-mono font-medium text-gray-900 dark:text-slate-100">
              {effective}-48227436
            </span>
            .
          </p>
          <div>
            <label htmlFor="courier-shipment-prefix" className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">
              Préfixe (lettres et chiffres, sans tiret)
            </label>
            <input
              id="courier-shipment-prefix"
              type="text"
              maxLength={COURIER_SHIPMENT_REFERENCE_PREFIX_MAX_LEN}
              disabled={loading}
              value={draft}
              onChange={(e) =>
                setDraft(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, COURIER_SHIPMENT_REFERENCE_PREFIX_MAX_LEN)
                )
              }
              placeholder={DEFAULT_COURIER_SHIPMENT_REFERENCE_PREFIX}
              className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm uppercase text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">
              Laisser vide pour utiliser le défaut <span className="font-mono">{DEFAULT_COURIER_SHIPMENT_REFERENCE_PREFIX}</span> (envoi).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void handleSave()} disabled={saving || loading}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {message.text ? (
              <span
                className={
                  message.tone === "ok"
                    ? "text-sm text-emerald-600 dark:text-emerald-400"
                    : message.tone === "err"
                      ? "text-sm text-red-600 dark:text-red-400"
                      : "text-sm text-gray-600"
                }
              >
                {message.text}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </SectionCard>
  );
};

export default ParametresCourierColis;
