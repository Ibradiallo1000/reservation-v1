// ✅ SimpleContactInfo.tsx — version corrigée complète

import React from 'react';
import type { SocialMediaLinks } from '@/types/companyTypes';

interface Props {
  contacts?: {
    email?: string;
    phone?: string;
    socialMedia?: SocialMediaLinks;
  };
}

const SimpleContactInfo: React.FC<Props> = ({ contacts }) => {
  return (
    <div className="text-sm space-y-2">
      {contacts?.email && (
        <p>
          <strong>Email:</strong>{' '}
          <a href={`mailto:${contacts.email}`} className="text-blue-600 hover:underline">
            {contacts.email}
          </a>
        </p>
      )}
      {contacts?.phone && (
        <p>
          <strong>Téléphone:</strong>{' '}
          <a href={`tel:${contacts.phone}`} className="text-green-600 hover:underline">
            {contacts.phone}
          </a>
        </p>
      )}

      {/* Réseaux sociaux si disponibles */}
      {contacts?.socialMedia?.facebook && (
        <p>
          <strong>Facebook:</strong>{' '}
          <a href={contacts.socialMedia.facebook} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            {contacts.socialMedia.facebook}
          </a>
        </p>
      )}
      {contacts?.socialMedia?.instagram && (
        <p>
          <strong>Instagram:</strong>{' '}
          <a href={contacts.socialMedia.instagram} target="_blank" rel="noreferrer" className="text-pink-600 hover:underline">
            {contacts.socialMedia.instagram}
          </a>
        </p>
      )}
      {contacts?.socialMedia?.twitter && (
        <p>
          <strong>Twitter:</strong>{' '}
          <a href={contacts.socialMedia.twitter} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
            {contacts.socialMedia.twitter}
          </a>
        </p>
      )}
      {contacts?.socialMedia?.linkedin && (
        <p>
          <strong>LinkedIn:</strong>{' '}
          <a href={contacts.socialMedia.linkedin} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
            {contacts.socialMedia.linkedin}
          </a>
        </p>
      )}
      {contacts?.socialMedia?.youtube && (
        <p>
          <strong>YouTube:</strong>{' '}
          <a href={contacts.socialMedia.youtube} target="_blank" rel="noreferrer" className="text-red-600 hover:underline">
            {contacts.socialMedia.youtube}
          </a>
        </p>
      )}
      {contacts?.socialMedia?.tiktok && (
        <p>
          <strong>TikTok:</strong>{' '}
          <a href={contacts.socialMedia.tiktok} target="_blank" rel="noreferrer" className="text-black hover:underline">
            {contacts.socialMedia.tiktok}
          </a>
        </p>
      )}
    </div>
  );
};

export default SimpleContactInfo;
