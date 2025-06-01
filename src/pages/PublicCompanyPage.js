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
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { MapPin, Search, Menu, X, ChevronDown, ChevronUp, Settings, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import { getThemeConfig } from '../theme/themes';
import { hexToRgba, safeTextColor } from '../utils/color';
import SocialIcon from '../components/SocialIcon';
import ContactForm from '../components/ui/ContactForm';
import SimpleContactInfo from '../components/ui/SimpleContactInfo';
import AvisClientForm from '../components/ui/AvisClientForm';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
/**
 * Page publique d'une compagnie de transport
 * @component
 * @returns {JSX.Element} La page publique de la compagnie
 */
const PublicCompanyPage = () => {
    var _a, _b;
    const { slug } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [company, setCompany] = useState(null);
    const [departure, setDeparture] = useState('');
    const [arrival, setArrival] = useState('');
    const [agences, setAgences] = useState([]);
    const [sliderIndex, setSliderIndex] = useState(0);
    const [openVilles, setOpenVilles] = useState({});
    const [showAgences, setShowAgences] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [suggestions, setSuggestions] = useState({
        departure: [],
        arrival: []
    });
    const [debouncedDeparture] = useDebounce(departure, 300);
    const [debouncedArrival] = useDebounce(arrival, 300);
    const fetchData = useCallback(() => __awaiter(void 0, void 0, void 0, function* () {
        if (!slug)
            return;
        try {
            setLoading(true);
            const q = query(collection(db, 'companies'), where('slug', '==', slug));
            const snap = yield getDocs(q);
            if (snap.empty) {
                setError(t('companyNotFound'));
                return;
            }
            const doc = snap.docs[0];
            const companyData = Object.assign({ id: doc.id }, doc.data());
            setCompany(companyData);
            const agQ = query(collection(db, 'agences'), where('companyId', '==', doc.id));
            const agSnap = yield getDocs(agQ);
            setAgences(agSnap.docs.map(d => (Object.assign({ id: d.id }, d.data()))));
        }
        catch (err) {
            console.error('Erreur de chargement:', err);
            setError(t('loadingError'));
        }
        finally {
            setLoading(false);
        }
    }), [slug, t]);
    useEffect(() => {
        fetchData();
    }, [fetchData]);
    useEffect(() => {
        const images = company === null || company === void 0 ? void 0 : company.imagesSlider;
        if (!Array.isArray(images) || images.length === 0)
            return;
        const interval = setInterval(() => {
            setSliderIndex(prev => (prev + 1) % images.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [company]);
    useEffect(() => {
        if (debouncedDeparture.length > 1) {
            const mockSuggestions = ['Abidjan', 'Abobo', 'Adjamé', 'Bouaké', 'Bondoukou'];
            setSuggestions(prev => (Object.assign(Object.assign({}, prev), { departure: mockSuggestions.filter(city => city.toLowerCase().includes(debouncedDeparture.toLowerCase())) })));
        }
        else {
            setSuggestions(prev => (Object.assign(Object.assign({}, prev), { departure: [] })));
        }
    }, [debouncedDeparture]);
    useEffect(() => {
        if (debouncedArrival.length > 1) {
            const mockSuggestions = ['Ouagadougou', 'Odienné', 'Ouangolodougou', 'Bobo-Dioulasso', 'Banfora'];
            setSuggestions(prev => (Object.assign(Object.assign({}, prev), { arrival: mockSuggestions.filter(city => city.toLowerCase().includes(debouncedArrival.toLowerCase())) })));
        }
        else {
            setSuggestions(prev => (Object.assign(Object.assign({}, prev), { arrival: [] })));
        }
    }, [debouncedArrival]);
    const { colors, classes, config } = useCompanyTheme(company);
    const validateInput = (value) => {
        const forbiddenChars = /[<>$]/;
        if (forbiddenChars.test(value)) {
            return false;
        }
        return value.trim().length > 1;
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validateInput(departure) || !validateInput(arrival)) {
            setError(t('invalidCity'));
            return;
        }
        const dep = encodeURIComponent(departure.trim());
        const arr = encodeURIComponent(arrival.trim());
        navigate(`/compagnie/${slug}/resultats?departure=${dep}&arrival=${arr}`);
    };
    const toggleVille = (ville) => {
        setOpenVilles(prev => (Object.assign(Object.assign({}, prev), { [ville]: !prev[ville] })));
    };
    const groupedByVille = useMemo(() => agences.reduce((acc, agence) => {
        if (!acc[agence.ville])
            acc[agence.ville] = [];
        acc[agence.ville].push(agence);
        return acc;
    }, {}), [agences]);
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen", style: { background: colors.background }, children: _jsx("div", { className: "animate-spin rounded-full h-12 w-12 border-t-2 border-b-2", style: { borderColor: colors.primary } }) }));
    }
    if (error) {
        return (_jsx("div", { className: "flex flex-col items-center justify-center min-h-screen p-4 text-center", style: { background: colors.background, color: colors.text }, children: _jsxs("div", { className: `p-4 rounded-lg max-w-md ${classes.card}`, children: [_jsx("h2", { className: "text-xl font-bold mb-2", children: t('error') }), _jsx("p", { children: error }), _jsx("button", { onClick: () => navigate('/'), className: `mt-4 px-4 py-2 rounded ${classes.button}`, style: { backgroundColor: colors.primary, color: colors.text }, children: t('backToHome') })] }) }));
    }
    if (!company)
        return null;
    return (_jsxs("div", { className: `min-h-screen flex flex-col ${config.typography}`, style: {
            background: colors.background,
            color: colors.text
        }, children: [_jsxs("header", { className: `sticky top-0 z-50 px-4 py-3 ${classes.header}`, style: {
                    backgroundColor: hexToRgba(colors.primary, 0.95),
                    backdropFilter: 'blur(10px)'
                }, children: [_jsxs("div", { className: "flex justify-between items-center max-w-7xl mx-auto", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(LazyLoadImage, { src: company.logoUrl, alt: `Logo ${((_a = company.nom) === null || _a === void 0 ? void 0 : _a.trim()) || t('unavailable')}`, effect: "blur", className: "h-10 w-10 rounded-full object-cover border-2", style: {
                                            borderColor: safeTextColor(colors.primary),
                                            backgroundColor: hexToRgba(colors.primary, 0.2)
                                        } }), _jsx("h1", { className: "text-xl font-bold tracking-tight", style: {
                                            color: safeTextColor(colors.primary),
                                            textShadow: '0 1px 3px rgba(0,0,0,0.5)'
                                        }, children: ((_b = company.nom) === null || _b === void 0 ? void 0 : _b.trim()) || t('unavailable') }), _jsx("div", { className: "ml-4 hidden md:block", children: _jsx(LanguageSwitcher, {}) })] }), _jsx("div", { className: "md:hidden flex items-center", children: _jsx("button", { onClick: () => setMenuOpen(!menuOpen), className: `p-2 rounded-md transition-all ${menuOpen ? 'bg-white/10' : ''}`, style: {
                                        color: safeTextColor(colors.primary),
                                        border: `1px solid ${hexToRgba(safeTextColor(colors.primary), 0.2)}`
                                    }, "aria-label": "Menu", children: menuOpen ? (_jsx(X, { className: "h-6 w-6", strokeWidth: 2.5 })) : (_jsx(Menu, { className: "h-6 w-6", strokeWidth: 2.5 })) }) }), _jsxs("nav", { className: "hidden md:flex gap-6 items-center text-sm", children: [_jsx("button", { onClick: () => setShowAgences(true), className: `font-medium ${config.animations}`, style: { color: safeTextColor(colors.primary) }, children: t('ourAgencies') }), _jsx("button", { onClick: () => navigate(`/compagnie/${slug}/mes-reservations`), className: `font-medium ${config.animations}`, style: { color: safeTextColor(colors.primary) }, children: t('myBookings') }), _jsx("button", { onClick: () => navigate(`/compagnie/${slug}/contact`), className: `font-medium ${config.animations}`, style: { color: safeTextColor(colors.primary) }, children: t('contact') }), _jsx("button", { onClick: () => navigate('/login'), className: `p-2 rounded-full ${classes.button}`, style: {
                                            backgroundColor: colors.secondary || hexToRgba(safeTextColor(colors.primary), 0.2),
                                            color: safeTextColor(colors.primary)
                                        }, "aria-label": t('login'), title: t('login'), children: _jsx(Settings, { className: "h-5 w-5" }) })] })] }), _jsx(AnimatePresence, { children: menuOpen && (_jsx(MobileMenu, { onClose: () => setMenuOpen(false), onNavigate: (path) => {
                                navigate(path);
                                setMenuOpen(false);
                            }, onShowAgencies: () => {
                                setShowAgences(true);
                                setMenuOpen(false);
                            }, slug: slug || '', colors: colors, classes: classes, config: config, t: t })) })] }), _jsx(HeroSection, { company: company, departure: departure, arrival: arrival, suggestions: suggestions, setDeparture: setDeparture, setArrival: setArrival, handleSubmit: handleSubmit, colors: colors, classes: classes, t: t, setSuggestions: setSuggestions }), company.imagesSlider && company.imagesSlider.length > 0 && (_jsx(ImageSlider, { images: company.imagesSlider, sliderIndex: sliderIndex, setSliderIndex: setSliderIndex, primaryColor: colors.primary, companyName: company.nom, config: config })), _jsx(AnimatePresence, { children: showAgences && (_jsx(AgencyList, { groupedByVille: groupedByVille, openVilles: openVilles, toggleVille: toggleVille, onClose: () => setShowAgences(false), primaryColor: colors.primary, classes: classes, t: t })) }), _jsx(Footer, { company: company, slug: slug, primaryColor: colors.primary, t: t })] }));
};
const MobileMenu = React.memo(({ onClose, onNavigate, onShowAgencies, slug, colors, classes, config, t }) => (_jsx(motion.div, { initial: { opacity: 0, y: -20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 }, transition: { duration: 0.2 }, className: "md:hidden absolute top-16 right-4 w-64 z-50", children: _jsx("div", { className: `rounded-lg shadow-xl p-4 ${classes.card}`, style: {
            backgroundColor: hexToRgba(colors.background, 0.95),
            backdropFilter: 'blur(10px)',
            border: `1px solid ${hexToRgba(colors.primary, 0.1)}`
        }, children: _jsxs("nav", { className: "flex flex-col gap-3", children: [_jsx("button", { onClick: onShowAgencies, className: `text-left px-4 py-2 rounded-md font-medium ${config.animations}`, style: {
                        color: colors.primary,
                        backgroundColor: hexToRgba(colors.primary, 0.1)
                    }, children: t('ourAgencies') }), _jsx("button", { onClick: () => onNavigate(`/compagnie/${slug}/mes-reservations`), className: `text-left px-4 py-2 rounded-md font-medium ${config.animations}`, style: {
                        color: colors.primary,
                        backgroundColor: hexToRgba(colors.primary, 0.1)
                    }, children: t('myBookings') }), _jsx("button", { onClick: () => onNavigate(`/compagnie/${slug}/contact`), className: `text-left px-4 py-2 rounded-md font-medium ${config.animations}`, style: {
                        color: colors.primary,
                        backgroundColor: hexToRgba(colors.primary, 0.1)
                    }, children: t('contact') }), _jsx("div", { className: "border-t my-2", style: { borderColor: hexToRgba(colors.primary, 0.1) } }), _jsx("button", { onClick: () => onNavigate('/login'), className: `text-left px-4 py-2 rounded-md font-medium ${config.animations}`, style: {
                        color: safeTextColor(colors.primary),
                        backgroundColor: colors.primary
                    }, children: t('login') })] }) }) })));
const HeroSection = React.memo(({ company, departure, arrival, suggestions, setDeparture, setArrival, setSuggestions, handleSubmit, colors, classes, t }) => (_jsx("section", { className: "relative bg-cover bg-center h-[400px] md:h-[500px]", style: { backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4)), url(${company.banniereUrl})` }, children: _jsxs("div", { className: "absolute inset-0 flex flex-col justify-center items-center text-center px-4", children: [_jsx(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 }, className: "max-w-3xl", children: _jsx("h2", { className: "text-3xl md:text-5xl font-bold mb-3 text-white drop-shadow-md", children: t('searchTitle') }) }), _jsx(motion.form, { onSubmit: handleSubmit, initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.2, duration: 0.5 }, className: "bg-white/00 backdrop-blur-md shadow-lg rounded-xl p-6 w-full max-w-md mx-4 mt-4 border border-white/20", children: _jsxs("div", { className: "space-y-4", children: [_jsx(CityInput, { label: t('departureCity'), value: departure, onChange: setDeparture, suggestions: suggestions.departure, onSelectSuggestion: (city) => {
                                setDeparture(city);
                                setSuggestions((prev) => (Object.assign(Object.assign({}, prev), { departure: [] })));
                            }, icon: _jsx(MapPin, { className: "h-5 w-5 text-white/80" }), placeholder: t('departurePlaceholder'), classes: classes }), _jsx(CityInput, { label: t('arrivalCity'), value: arrival, onChange: setArrival, suggestions: suggestions.arrival, onSelectSuggestion: (city) => {
                                setArrival(city);
                                setSuggestions((prev) => (Object.assign(Object.assign({}, prev), { departure: [] })));
                            }, icon: _jsx(MapPin, { className: "h-5 w-5 text-white/80" }), placeholder: t('arrivalPlaceholder'), classes: classes }), _jsxs(motion.button, { type: "submit", whileHover: { scale: 1.02 }, whileTap: { scale: 0.98 }, className: `w-full py-3 font-bold flex items-center justify-center rounded-lg ${classes.button}`, style: {
                                backgroundColor: colors.primary,
                                color: colors.text,
                                boxShadow: `0 4px 14px 0 ${hexToRgba(colors.primary, 0.4)}`
                            }, children: [_jsx(Search, { className: "h-5 w-5 mr-2" }), t('searchTrip')] })] }) })] }) })));
const CityInput = React.memo(({ label, value, onChange, suggestions, onSelectSuggestion, icon, placeholder, classes }) => (_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-white/90 mb-1", children: label }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: "absolute left-3 top-1/2 transform -translate-y-1/2", children: icon }), _jsx("input", { type: "text", value: value, onChange: (e) => onChange(e.target.value), required: true, placeholder: placeholder, className: `pl-10 w-full bg-white/20 h-12 rounded-lg text-base text-white placeholder-white/60 ${classes.input}` }), suggestions.length > 0 && (_jsx("ul", { className: "absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg max-h-60 overflow-auto", children: suggestions.map((city, i) => (_jsx("li", { children: _jsx("button", { type: "button", onClick: () => onSelectSuggestion(city), className: "w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-800", children: city }) }, i))) }))] })] })));
const ImageSlider = React.memo(({ images, sliderIndex, setSliderIndex, primaryColor, companyName, config }) => (_jsxs("section", { className: "w-full max-w-6xl mx-auto mt-12 px-4", children: [_jsx("h2", { className: "text-2xl font-bold mb-6 text-center", style: { color: primaryColor }, children: companyName ? `Découvrez ${companyName}` : 'Découvrez notre compagnie' }), _jsxs("div", { className: `relative overflow-hidden rounded-xl ${config.effects} h-80`, children: [images.map((img, index) => (_jsx("div", { className: `absolute inset-0 transition-opacity duration-1000 ${index === sliderIndex ? 'opacity-100' : 'opacity-0'}`, children: _jsx(LazyLoadImage, { src: img, alt: `Slide ${index + 1}`, effect: "blur", className: "w-full h-full object-cover" }) }, index))), _jsx("div", { className: "absolute bottom-4 left-0 right-0 flex justify-center gap-2", children: images.map((_, index) => (_jsx("button", { onClick: () => setSliderIndex(index), className: `w-3 h-3 rounded-full transition ${index === sliderIndex ? 'bg-white' : 'bg-white/50'}`, "aria-label": `Aller au slide ${index + 1}` }, index))) })] })] })));
const AgencyList = React.memo(({ groupedByVille, openVilles, toggleVille, onClose, primaryColor, classes, t }) => (_jsx(motion.section, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, className: "max-w-6xl mx-auto mt-12 px-4 pb-12", children: _jsxs("div", { className: `${classes.card} p-6`, children: [_jsxs("div", { className: "flex justify-between items-center mb-6", children: [_jsx("h2", { className: "text-2xl font-bold", style: { color: primaryColor }, children: t('ourAgencies') }), _jsx("button", { onClick: onClose, className: `p-2 rounded-full ${classes.animations}`, style: { color: primaryColor }, "aria-label": t('close'), children: _jsx(X, { className: "h-5 w-5" }) })] }), _jsx("div", { className: "space-y-6", children: Object.entries(groupedByVille).map(([ville, agencesDansVille]) => (_jsxs("div", { className: "mb-4", children: [_jsxs("button", { onClick: () => toggleVille(ville), className: `flex items-center justify-between w-full text-left px-5 py-3 ${classes.animations} ${openVilles[ville] ? classes.card : `hover:${classes.card}`}`, style: {
                                border: `1px solid ${openVilles[ville] ? primaryColor : hexToRgba(primaryColor, 0.2)}`,
                                backgroundColor: openVilles[ville]
                                    ? hexToRgba(primaryColor, 0.1)
                                    : 'transparent'
                            }, children: [_jsx("span", { className: "font-semibold text-lg", children: ville }), openVilles[ville] ? (_jsx(ChevronUp, { style: { color: primaryColor } })) : (_jsx(ChevronDown, { style: { color: primaryColor } }))] }), _jsx(AnimatePresence, { children: openVilles[ville] && (_jsx(motion.div, { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 }, className: "overflow-hidden", children: _jsx("div", { className: "mt-3 space-y-3 pl-4", children: agencesDansVille.map((agence) => (_jsx(AgencyItem, { agence: agence, primaryColor: primaryColor, classes: classes, t: t }, agence.id))) }) })) })] }, ville))) })] }) })));
const AgencyItem = React.memo(({ agence, primaryColor, classes, t }) => (_jsxs(motion.div, { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 }, transition: { delay: 0.1 }, className: `${classes.card} p-4 cursor-pointer`, children: [_jsxs("h3", { className: "font-semibold text-lg flex items-center gap-2", children: [_jsx("span", { className: "w-2 h-2 rounded-full", style: { backgroundColor: primaryColor } }), agence.nomAgence] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm", children: [_jsxs("p", { children: [_jsxs("span", { className: "font-medium", children: [t('country'), ":"] }), " ", agence.pays] }), _jsxs("p", { children: [_jsxs("span", { className: "font-medium", children: [t('district'), ":"] }), " ", agence.quartier || '—'] }), _jsxs("p", { children: [_jsxs("span", { className: "font-medium", children: [t('address'), ":"] }), " ", agence.adresse || t('notSpecified')] }), _jsxs("p", { className: "flex items-center gap-1", children: [_jsx(Phone, { className: "h-4 w-4" }), _jsxs("span", { className: "font-medium", children: [t('phone'), ":"] }), " ", agence.telephone || '—'] })] })] })));
const Footer = React.memo(({ company, slug, primaryColor, t }) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    return (_jsxs("footer", { className: "mt-auto bg-gray-50 dark:bg-gray-900", children: [_jsxs("div", { className: "max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-4 gap-8", children: [_jsxs("div", { children: [_jsx("h4", { className: "font-semibold mb-2", children: t('about') }), _jsx("p", { children: company.description || t('welcomeTransport') })] }), ((_a = company.footerConfig) === null || _a === void 0 ? void 0 : _a.showSocialMedia) && (_jsxs("div", { children: [_jsx("h4", { className: "font-semibold mb-2", children: t('followUs') }), _jsxs("div", { className: "flex gap-4 flex-wrap", children: [((_b = company.socialMedia) === null || _b === void 0 ? void 0 : _b.facebook) && (_jsx(SocialIcon, { url: company.socialMedia.facebook, platform: "facebook", primaryColor: primaryColor })), ((_c = company.socialMedia) === null || _c === void 0 ? void 0 : _c.instagram) && (_jsx(SocialIcon, { url: company.socialMedia.instagram, platform: "instagram", primaryColor: primaryColor })), ((_d = company.socialMedia) === null || _d === void 0 ? void 0 : _d.tiktok) && (_jsx(SocialIcon, { url: company.socialMedia.tiktok, platform: "tiktok", primaryColor: primaryColor })), ((_e = company.socialMedia) === null || _e === void 0 ? void 0 : _e.linkedin) && (_jsx(SocialIcon, { url: company.socialMedia.linkedin, platform: "linkedin", primaryColor: primaryColor })), ((_f = company.socialMedia) === null || _f === void 0 ? void 0 : _f.twitter) && (_jsx(SocialIcon, { url: company.socialMedia.twitter, platform: "twitter", primaryColor: primaryColor })), ((_g = company.socialMedia) === null || _g === void 0 ? void 0 : _g.youtube) && (_jsx(SocialIcon, { url: company.socialMedia.youtube, platform: "youtube", primaryColor: primaryColor }))] })] })), ((_h = company.footerConfig) === null || _h === void 0 ? void 0 : _h.showTestimonials) && (_jsxs("div", { children: [_jsx("h4", { className: "font-semibold mb-2", children: t('customerReviews') }), _jsx(AvisClientForm, { companyId: company.id, onSuccess: () => { } })] })), _jsxs("div", { children: [_jsx("h4", { className: "font-semibold mb-2", children: t('contact') }), ((_j = company.footerConfig) === null || _j === void 0 ? void 0 : _j.showContactForm) ? (_jsx(ContactForm, { primaryColor: primaryColor })) : (_jsx(SimpleContactInfo, { contacts: {
                                    email: company.email,
                                    phone: company.telephone,
                                    socialMedia: company.socialMedia,
                                } }))] })] }), ((_k = company.footerConfig) === null || _k === void 0 ? void 0 : _k.showLegalLinks) && (_jsxs("div", { className: "border-t mt-8 pt-4 text-center text-sm text-gray-500", children: [_jsxs("div", { className: "flex justify-center gap-6 flex-wrap", children: [_jsx("a", { href: `/compagnie/${slug}/mentions`, className: "hover:underline", children: t('legalMentions') }), _jsx("a", { href: `/compagnie/${slug}/confidentialite`, className: "hover:underline", children: t('privacyPolicy') })] }), _jsxs("p", { className: "mt-2", children: ["\u00A9 ", new Date().getFullYear(), " ", company.nom || t('ourCompany'), " \u2014 ", t('allRightsReserved')] })] }))] }));
});
const useCompanyTheme = (company) => {
    return useMemo(() => {
        const themeConfig = getThemeConfig((company === null || company === void 0 ? void 0 : company.themeStyle) || 'moderne');
        const primaryColor = (company === null || company === void 0 ? void 0 : company.couleurPrimaire) || themeConfig.colors.primary;
        const secondaryColor = (company === null || company === void 0 ? void 0 : company.couleurSecondaire) || themeConfig.colors.secondary;
        return {
            config: themeConfig,
            colors: {
                primary: primaryColor,
                secondary: secondaryColor,
                text: safeTextColor(primaryColor),
                background: themeConfig.colors.background
            },
            classes: {
                background: themeConfig.colors.background,
                text: themeConfig.colors.text,
                card: themeConfig.effects.includes('bg-opacity')
                    ? `${themeConfig.effects} ${themeConfig.borders}`
                    : `bg-white ${themeConfig.effects} ${themeConfig.borders}`,
                button: `${themeConfig.buttons} ${themeConfig.animations}`,
                input: `${themeConfig.borders} ${themeConfig.animations}`,
                header: themeConfig.effects.includes('backdrop-filter')
                    ? `${themeConfig.effects} ${themeConfig.borders}`
                    : `bg-white ${themeConfig.effects} ${themeConfig.borders}`,
                animations: themeConfig.animations
            }
        };
    }, [company]);
};
export default PublicCompanyPage;
