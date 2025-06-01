// ✅ FICHIER 2 — MentionsPage.tsx (à placer dans src/pages)
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';

const MentionsPage = () => {
  const { slug } = useParams();
  const [texte, setTexte] = useState('');

  useEffect(() => {
    const fetch = async () => {
      const q = query(collection(db, 'companies'), where('slug', '==', slug));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setTexte(data.mentionsLegales || 'Aucune mention disponible.');
      }
    };
    fetch();
  }, [slug]);

  return (
    <div className="max-w-4xl mx-auto p-6 text-justify">
      <h1 className="text-2xl font-bold mb-4">Mentions légales</h1>
      <p className="whitespace-pre-wrap">{texte}</p>
    </div>
  );
};

export default MentionsPage;