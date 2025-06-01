// ✅ src/components/SocialIcon.tsx — avec fallback pour TikTok

import React from 'react';
import {
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Globe,
  PlayCircle, // fallback pour TikTok
} from 'lucide-react';

const icons = {
  facebook: Facebook,
  instagram: Instagram,
  twitter: Twitter,
  linkedin: Linkedin,
  youtube: Youtube,
  tiktok: PlayCircle, // TikTok remplacé par une icône vidéo
};

interface Props {
  url: string;
  platform: keyof typeof icons;
  primaryColor?: string;
}

const SocialIcon: React.FC<Props> = ({ url, platform, primaryColor = '#3B82F6' }) => {
  const Icon = icons[platform] || Globe;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="p-2 rounded-full hover:bg-opacity-10"
      style={{ color: primaryColor }}
      aria-label={`Suivez-nous sur ${platform}`}
    >
      <Icon size={24} />
    </a>
  );
};

export default SocialIcon;
