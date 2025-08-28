import React, { useState } from 'react';
import { chefApproveShift } from '@/services/chefApproveShift';

export default function ChefApprovalModal({ open, onClose, ctx }:{
  open:boolean; onClose:()=>void;
  ctx:{ companyId:string; agencyId:string; shiftId:string; user:{id:string; name:string} }
}) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 grid place-items-center z-50">
      <div className="bg-white rounded-xl p-4 w-full max-w-md space-y-3">
        <h3 className="font-semibold text-lg">Approbation Chef d’agence</h3>
        <label className="block">
          <span className="text-sm">Note (facultatif)</span>
          <textarea className="mt-1 w-full border rounded px-3 py-2" rows={3}
                    value={note} onChange={e=>setNote(e.target.value)} />
        </label>

        <div className="flex justify-end gap-2">
          <button className="px-3 py-2 border rounded" onClick={onClose}>Annuler</button>
          <button
            className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
            disabled={loading}
            onClick={async()=>{
              setLoading(true);
              await chefApproveShift({
                companyId: ctx.companyId, agencyId: ctx.agencyId, shiftId: ctx.shiftId,
                userId: ctx.user.id, userName: ctx.user.name, note
              }).finally(()=>setLoading(false));
              onClose();
            }}
          >Valider définitivement</button>
        </div>
      </div>
    </div>
  );
}
