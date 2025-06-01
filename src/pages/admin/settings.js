var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ✅ src/pages/admin/settings.tsx
import { useState } from 'react';
import FooterConfig from '../../components/admin/FooterConfig'; // vérifie que FooterConfig a bien `export default`
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
const CompanySettings = () => {
    const [company, setCompany] = useState({
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
    const updateFooterConfig = (newConfig) => __awaiter(void 0, void 0, void 0, function* () {
        const ref = doc(db, 'companies', company.id);
        yield updateDoc(ref, newConfig);
        setCompany(prev => (Object.assign(Object.assign({}, prev), newConfig)));
    });
    return (_jsxs("div", { className: "space-y-8 p-6", children: [_jsx("h2", { className: "text-xl font-semibold", children: "Configuration de la vitrine" }), _jsx(FooterConfig, { company: company, onUpdate: updateFooterConfig })] }));
};
export default CompanySettings;
