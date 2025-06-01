import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
const LanguageSwitcher = () => {
    const { i18n } = useTranslation();
    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };
    return (_jsxs("div", { className: "flex gap-2 text-sm", children: [_jsx("button", { onClick: () => changeLanguage('fr'), className: "hover:underline", children: "\uD83C\uDDEB\uD83C\uDDF7" }), _jsx("button", { onClick: () => changeLanguage('en'), className: "hover:underline", children: "\uD83C\uDDEC\uD83C\uDDE7" })] }));
};
export default LanguageSwitcher;
