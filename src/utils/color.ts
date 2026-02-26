// ✅ Convertit une couleur hexadécimale (#fff ou #ffffff) en rgba avec transparence
export const hexToRgba = (hex: string, alpha: number = 1): string => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 0, 0, ${alpha})`;

  const [r, g, b] = [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ✅ Retourne une couleur de texte sûre (blanc ou noir) selon la luminosité et le contraste
export const safeTextColor = (bgColor: string): string => {
  const color = bgColor.replace('#', '');
  if (color.length !== 6) return '#1e293b'; // fallback gris foncé

  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);

  // Calcul luminance relative (WCAG)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Contraste : si clair → texte foncé, sinon → texte clair
  const baseColor = luminance > 0.6 ? '#1e293b' : '#FFFFFF';

  // ✅ Empêcher le blanc pur (#FFFFFF) sur fond clair
  if (baseColor === '#FFFFFF' && luminance > 0.8) {
    return '#1e293b'; // force un texte foncé
  }

  return baseColor;
};

// ✅ Ajuste la luminosité d’une couleur hexadécimale de manière contrôlée
export const adjustBrightness = (hex: string, percent: number): string => {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;

  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : G) : 255)
    )
      .toString(16)
      .slice(1)
  );
};

/** Couleur lisible sur fond sombre (mode nuit). Mélange avec blanc pour garder la teinte. */
export const lightenForDarkMode = (hex: string, mixWithWhite = 0.55): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.replace('#', ''));
  if (!result) return '#fdba74';
  const r = Math.round(parseInt(result[1], 16) * (1 - mixWithWhite) + 255 * mixWithWhite);
  const g = Math.round(parseInt(result[2], 16) * (1 - mixWithWhite) + 255 * mixWithWhite);
  const b = Math.round(parseInt(result[3], 16) * (1 - mixWithWhite) + 255 * mixWithWhite);
  return '#' + [r, g, b].map((x) => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('');
};
