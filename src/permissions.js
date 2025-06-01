export const permissionsByRole = {
    admin_platforme: ['dashboard', 'finances', 'statistiques', 'parametres'],
    admin_compagnie: ['dashboard', 'trajets', 'reservations', 'agences', 'guichet', 'courriers', 'personnel', 'parametres'],
    chefAgence: ['dashboard', 'trajets', 'reservations', 'guichet', 'courriers'],
    guichetier: ['guichet', 'reservations'],
    gestionnaire: ['trajets', 'reservations', 'finances'],
    agentCourrier: ['courriers'],
    support: ['parametres']
};
export const hasPermission = (role, module) => {
    var _a, _b;
    return (_b = (_a = permissionsByRole[role]) === null || _a === void 0 ? void 0 : _a.includes(module)) !== null && _b !== void 0 ? _b : false;
};
