var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from 'react';
import { generateDailyTrips } from '../services/generateDailyTrips';
const AutoGeneratePage = () => {
    useEffect(() => {
        const run = () => __awaiter(void 0, void 0, void 0, function* () {
            yield generateDailyTrips();
            console.log('🚀 DailyTrips générés automatiquement');
        });
        run();
    }, []);
    return _jsx("div", { children: "DailyTrips g\u00E9n\u00E9r\u00E9s automatiquement." });
};
export default AutoGeneratePage;
