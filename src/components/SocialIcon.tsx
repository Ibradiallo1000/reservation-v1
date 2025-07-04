// src/components/SocialIcon.tsx

import React from 'react';
import {
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Globe,
  PlayCircle, // fallback TikTok
} from 'lucide-react';

const icons = {
  facebook: Facebook,
  instagram: Instagram,
  twitter: Twitter,
  linkedin: Linkedin,
  youtube: Youtube,
  tiktok: PlayCircle,
};

interface Props {
  url: string;
  platform: keyof typeof icons;
  primaryColor?: string;
  size?: number;
}

const SocialIcon: React.FC<Props> = ({
  url,
  platform,
  primaryColor = '#3B82F6',
  size = 24,
}) => {
  const Icon = icons[platform] || Globe;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="p-2 rounded-full hover:bg-opacity-10 transition"
      style={{ color: primaryColor }}
      aria-label={`Suivez-nous sur ${platform}`}
    >
      <Icon size={size} />
    </a>
  );
};

export default SocialIcon;
