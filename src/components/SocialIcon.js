import { jsx as _jsx } from "react/jsx-runtime";
import { Facebook, Instagram, Twitter, Linkedin, Youtube, Globe, PlayCircle, // fallback pour TikTok
 } from 'lucide-react';
const icons = {
    facebook: Facebook,
    instagram: Instagram,
    twitter: Twitter,
    linkedin: Linkedin,
    youtube: Youtube,
    tiktok: PlayCircle, // TikTok remplacé par une icône vidéo
};
const SocialIcon = ({ url, platform, primaryColor = '#3B82F6' }) => {
    const Icon = icons[platform] || Globe;
    return (_jsx("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "p-2 rounded-full hover:bg-opacity-10", style: { color: primaryColor }, "aria-label": `Suivez-nous sur ${platform}`, children: _jsx(Icon, { size: 24 }) }));
};
export default SocialIcon;
