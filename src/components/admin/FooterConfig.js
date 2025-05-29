import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const FooterConfig = ({ company, onUpdate }) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: (_b = (_a = company.footerConfig) === null || _a === void 0 ? void 0 : _a.showSocialMedia) !== null && _b !== void 0 ? _b : false, onChange: (e) => onUpdate({
                                    footerConfig: Object.assign(Object.assign({}, company.footerConfig), { showSocialMedia: e.target.checked }),
                                }) }), "Afficher les r\u00E9seaux sociaux"] }), _jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: (_d = (_c = company.footerConfig) === null || _c === void 0 ? void 0 : _c.showTestimonials) !== null && _d !== void 0 ? _d : false, onChange: (e) => onUpdate({
                                    footerConfig: Object.assign(Object.assign({}, company.footerConfig), { showTestimonials: e.target.checked }),
                                }) }), "Afficher les avis clients"] }), _jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: (_f = (_e = company.footerConfig) === null || _e === void 0 ? void 0 : _e.showLegalLinks) !== null && _f !== void 0 ? _f : false, onChange: (e) => onUpdate({
                                    footerConfig: Object.assign(Object.assign({}, company.footerConfig), { showLegalLinks: e.target.checked }),
                                }) }), "Afficher les liens l\u00E9gaux (FAQ, CGU...)"] }), _jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: (_h = (_g = company.footerConfig) === null || _g === void 0 ? void 0 : _g.showContactForm) !== null && _h !== void 0 ? _h : false, onChange: (e) => onUpdate({
                                    footerConfig: Object.assign(Object.assign({}, company.footerConfig), { showContactForm: e.target.checked }),
                                }) }), "Afficher le formulaire de contact"] })] }), _jsxs("div", { className: "border-t pt-6", children: [_jsx("h3", { className: "text-lg font-medium mb-4", children: "R\u00E9seaux sociaux" }), ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'].map((platform) => {
                        var _a;
                        return (_jsxs("div", { className: "mb-3", children: [_jsx("label", { className: "block text-sm font-medium mb-1 capitalize", children: platform }), _jsx("input", { type: "url", value: ((_a = company.socialMedia) === null || _a === void 0 ? void 0 : _a[platform]) || '', onChange: (e) => onUpdate({
                                        socialMedia: Object.assign(Object.assign({}, company.socialMedia), { [platform]: e.target.value }),
                                    }), placeholder: `https://${platform}.com/votre-page`, className: "w-full px-3 py-2 border border-gray-300 rounded" })] }, platform));
                    })] })] }));
};
export default FooterConfig;
