import React from 'react';
import {
  CheckCircle2, Download, Trash2, AlertCircle,
  User, MapPin, Building, Wallet
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Reservation } from '../types/index';

const statusStyles: Record<Reservation['statut'], string> = {
  payé: 'bg-emerald-100 text-emerald-800',
  preuve_recue: 'bg-amber-100 text-amber-800',
  annulé: 'bg-red-100 text-red-800',
  refusé: 'bg-red-100 text-red-800',
  en_attente: '',
  paiement_en_cours: '',
  embarqué: ''
};

interface Props {
  reservation: Reservation;
  onValider: (id: string) => void;
  onRefuser: (id: string) => void;
  onSupprimer: (id: string) => void;
  isLoading: boolean;
}

export const ReservationCard: React.FC<Props> = ({
  reservation,
  onValider,
  onRefuser,
  onSupprimer,
  isLoading
}) => {
  return (
    <div className="bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
      <div className="grid grid-cols-1">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 font-semibold text-slate-800">
                <User className="w-4 h-4 text-slate-400" />
                {reservation.nomClient || reservation.clientNom || '--'}
              </div>
              <p className="text-sm text-slate-500">{reservation.telephone || '--'}</p>
              {reservation.email && <p className="text-sm text-slate-500">{reservation.email}</p>}
              <span className={`inline-block text-xs px-2 py-1 rounded-full ${statusStyles[reservation.statut]}`}>
                {reservation.statut.replace('_', ' ')}
              </span>
            </div>
            <div className="text-right text-xs text-slate-400 font-mono">
              {reservation.referenceCode}
            </div>
          </div>

          <div className="flex justify-between items-center text-slate-700">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="font-semibold">{reservation.depart} → {reservation.arrivee}</span>
            </div>
            <div className="text-sm text-slate-500">
              {reservation.date} à {reservation.heure}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-slate-800">
              <Building className="w-4 h-4 text-slate-400" />
              {reservation.agencyNom || '--'}
            </div>
            <div className="text-sm text-slate-500">{reservation.agencyTelephone || '--'}</div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-slate-800">
              <Wallet className="w-4 h-4 text-slate-400" />
              <span className="font-semibold">
                {reservation.montant?.toLocaleString()} FCFA
              </span>
            </div>
            <div className="text-sm text-slate-500">
              Places : {reservation.seatsGo}{reservation.seatsReturn ? ` + ${reservation.seatsReturn}` : ''}
            </div>
          </div>

          {reservation.preuveMessage && (
            <div className="text-sm text-slate-600 bg-slate-50 border p-2 rounded">
              <p className="font-medium text-slate-700 mb-1">Message :</p>
              {reservation.preuveMessage}
            </div>
          )}
        </div>
      </div>

      <div className="border-t px-4 py-3 flex flex-wrap gap-2 bg-slate-50 justify-end">
        {reservation.statut === 'preuve_recue' && (
          <>
            <motion.button
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onValider(reservation.id)}
              className={`px-3 py-2 rounded bg-emerald-600 text-white text-xs flex items-center gap-1 ${
                isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isLoading ? '...' : 'Valider'}
            </motion.button>

            <motion.button
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onRefuser(reservation.id)}
              className={`px-3 py-2 rounded bg-red-600 text-white text-xs flex items-center gap-1 ${
                isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-700'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              {isLoading ? '...' : 'Refuser'}
            </motion.button>
          </>
        )}

        {reservation.preuveUrl && (
          <a
            href={reservation.preuveUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded border border-gray-300 text-xs text-slate-600 hover:bg-gray-50 flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> Voir preuve
          </a>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSupprimer(reservation.id)}
          className="px-3 py-2 rounded text-red-600 text-xs hover:text-red-800 flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" /> Supprimer
        </motion.button>
      </div>
    </div>
  );
};
