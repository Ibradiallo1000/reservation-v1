# Teliya — Référence autocomplete des villes

Source : liste en mémoire dérivée des trajets actifs des compagnies publiques éligibles. Aucune requête à la frappe.

Normalisation : trim, espaces multiples, Unicode NFKD, accents, casse, apostrophes et tirets. Le premier libellé public réel est conservé pour l’affichage et les variantes sont dédupliquées.

Recherche : préfixes en premier, occurrences internes ensuite, ordre alphabétique français, huit options maximum. Départ et arrivée utilisent le même `PublicCityCombobox`; l’autre valeur est exclue.

Sélection : toute frappe invalide la sélection implicite. À la soumission, le libellé doit correspondre à une option normalisée réelle, sinon « Sélectionnez une ville dans la liste. »

Accessibilité : label, `role=combobox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, listbox/options, flèches, Entrée, Échap, Tab, tactile et fermeture au blur.
