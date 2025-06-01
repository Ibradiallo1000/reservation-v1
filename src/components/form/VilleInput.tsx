import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface VilleInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const VilleInput: React.FC<VilleInputProps> = ({ label, value, onChange }) => {
  const [villes, setVilles] = useState<string[]>([]);

  useEffect(() => {
    const fetchVilles = async () => {
      const snap = await getDocs(collection(db, 'villes'));
      const noms = snap.docs.map(doc => doc.data().nom);
      setVilles(noms);
    };
    fetchVilles();
  }, []);

  return (
    <div>
      <label className="block font-medium mb-1">{label}</label>
      <input
        list="liste-villes"
        className="w-full border px-3 py-2 rounded"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Entrer une ville"
      />
      <datalist id="liste-villes">
        {villes.map((ville, idx) => (
          <option key={idx} value={ville} />
        ))}
      </datalist>
    </div>
  );
};

export default VilleInput;
