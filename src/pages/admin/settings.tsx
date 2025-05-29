// ✅ src/pages/admin/settings.tsx

import React, { useState } from 'react';
import FooterConfig from '../../components/admin/FooterConfig'; // vérifie que FooterConfig a bien `export default`
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface Company {
  id: string;
  footerConfig?: {
    showSocialMedia?: boolean;
    showTestimonials?: boolean;
    showLegalLinks?: boolean;
    showContactForm?: boolean;
  };
  socialMedia?: Record<string, string>;
}

const CompanySettings = () => {
  const [company, setCompany] = useState<Company>({
    id: 'ID_COMPAGNIE_PAR_DEFAUT',
    footerConfig: {
      showSocialMedia: true,
      showTestimonials: false,
      showLegalLinks: true,
      showContactForm: true,
    },
    socialMedia: {
      facebook: '',
      instagram: '',
      tiktok: '',
      youtube: '',
      twitter: '',
      linkedin: '',
    }
  });

  const updateFooterConfig = async (newConfig: Partial<Company>) => {
    const ref = doc(db, 'companies', company.id);
    await updateDoc(ref, newConfig);
    setCompany(prev => ({ ...prev, ...newConfig }));
  };

  return (
    <div className="space-y-8 p-6">
      <h2 className="text-xl font-semibold">Configuration de la vitrine</h2>
      <FooterConfig company={company} onUpdate={updateFooterConfig} />
    </div>
  );
};

export default CompanySettings;
