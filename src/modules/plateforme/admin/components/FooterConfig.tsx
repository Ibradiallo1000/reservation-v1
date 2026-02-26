// ✅ src/components/admin/FooterConfig.tsx — version complète et fonctionnelle

import React from 'react';

interface FooterConfigProps {
  company: {
    footerConfig?: {
      showSocialMedia?: boolean;
      showTestimonials?: boolean;
      showLegalLinks?: boolean;
      showContactForm?: boolean;
    };
    socialMedia?: Record<string, string>;
  };
  onUpdate: (updatedData: Partial<any>) => void;
}

const FooterConfig: React.FC<FooterConfigProps> = ({ company, onUpdate }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={company.footerConfig?.showSocialMedia ?? false}
            onChange={(e) =>
              onUpdate({
                footerConfig: {
                  ...company.footerConfig,
                  showSocialMedia: e.target.checked,
                },
              })
            }
          />
          Afficher les réseaux sociaux
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={company.footerConfig?.showTestimonials ?? false}
            onChange={(e) =>
              onUpdate({
                footerConfig: {
                  ...company.footerConfig,
                  showTestimonials: e.target.checked,
                },
              })
            }
          />
          Afficher les avis clients
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={company.footerConfig?.showLegalLinks ?? false}
            onChange={(e) =>
              onUpdate({
                footerConfig: {
                  ...company.footerConfig,
                  showLegalLinks: e.target.checked,
                },
              })
            }
          />
          Afficher les liens légaux (FAQ, CGU...)
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={company.footerConfig?.showContactForm ?? false}
            onChange={(e) =>
              onUpdate({
                footerConfig: {
                  ...company.footerConfig,
                  showContactForm: e.target.checked,
                },
              })
            }
          />
          Afficher le formulaire de contact
        </label>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-4">Réseaux sociaux</h3>
        {['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'].map((platform) => (
          <div key={platform} className="mb-3">
            <label className="block text-sm font-medium mb-1 capitalize">
              {platform}
            </label>
            <input
              type="url"
              value={company.socialMedia?.[platform] || ''}
              onChange={(e) =>
                onUpdate({
                  socialMedia: {
                    ...company.socialMedia,
                    [platform]: e.target.value,
                  },
                })
              }
              placeholder={`https://${platform}.com/votre-page`}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FooterConfig;