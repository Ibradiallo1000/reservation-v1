import React, { useState } from 'react';
import { validateShiftWithDeposit } from '@/services/validateShiftWithDeposit';

export default function ValidateShiftModal({ open, onClose, ctx }:{
  open:boolean; onClose:()=>void;
  ctx:{ companyId:string; agencyId:string; shiftId:string; attendu:number; user:{id:string; name:string} }
}) {
  const [deposit, setDeposit] = useState<number>(ctx.attendu || 0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 grid place-items-center z-50">
      <div className="bg-white rounded-xl p-4 w-full max-w-md space-y-3">
        <h3 className="font-semibold text-lg">Valider la session (Comptabilité)</h3>
        <div className="text-sm text-gray-600">Attendu: <b>{ctx.attendu.toLocaleString()} FCFA</b></div>
        <label className="block">
          <span className="text-sm">Montant déposé</span>
          <input type="number" className="mt-1 w-full border rounded px-3 py-2"
                 value={deposit} onChange={e=>setDeposit(Number(e.target.value))}/>
        </label>
        <label className="block">
          <span className="text-sm">Commentaire (si écart)</span>
          <textarea className="mt-1 w-full border rounded px-3 py-2" rows={3}
                    value={note} onChange={e=>setNote(e.target.value)} />
        </label>

        <div className="flex justify-end gap-2">
          <button className="px-3 py-2 border rounded" onClick={onClose}>Annuler</button>
          <button
            className="px-3 py-2 rounded bg-orange-600 text-white disabled:opacity-50"
            disabled={loading}
            onClick={async()=>{
              setLoading(true);
              await validateShiftWithDeposit({
                companyId: ctx.companyId, agencyId: ctx.agencyId, shiftId: ctx.shiftId,
                declaredDeposit: deposit, discrepancyNote: note || null,
                userId: ctx.user.id, userName: ctx.user.name
              }).finally(()=>setLoading(false));
              onClose();
            }}
          >Valider</button>
        </div>
      </div>
    </div>
  );
}
