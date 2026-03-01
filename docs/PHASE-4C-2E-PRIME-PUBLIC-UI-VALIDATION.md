# STEP 4C-2E-PRIME — Public UI premium alignment

## Scope

- ReservationClientPage.tsx
- ReservationDetailsPage.tsx
- ClientMesReservationsPage.tsx
- ClientMesBilletsPage.tsx
- UploadPreuvePage.tsx
- ReceiptEnLignePage.tsx
- TicketOnline.tsx
- ResultatsAgencePage.tsx
- VilleSuggestionBar.tsx

## Changes applied

### 1. ReservationClientPage.tsx

- **SectionCard:** Payment/proof section, RouteCard (Votre trajet), Ticket view (Détails du billet), Status block (Statut), Date section, Time section, Personal info section. Payment section wrapper left as `<div ref={paymentSectionRef}>` (no card container).
- **StatusBadge:** Canal (Guichet/En ligne), Reference, status labels in ticket view. Step indicator and payment popup kept with theme colors (no badge replacement for step numbers).
- **Spacing:** `shadow-md` on SectionCards; error/alert blocks neutralized to `border border-gray-200 bg-gray-50` where appropriate.
- **Preserved:** Theme primary/secondary on CTAs, gradient buttons, date/time selectors; booking and payment logic unchanged.

### 2. ReservationDetailsPage.tsx

- **SectionCard:** Error state ("Réservation introuvable"), Suivi de paiement, Statut bandeau, Détails du voyage. Error state content centered inside SectionCard.
- **StatusBadge:** Payment method chip (paymentChip.text) → `<StatusBadge status="neutral">`.
- **Preserved:** Step progress bar, status icon colors, CTAs (theme colors), confetti, bottom bar.

### 3. ClientMesReservationsPage.tsx

- **SectionCard:** "Recherche par téléphone", "Résultats" (noPad, right = count). StatusPill refactored to use StatusBadge with `statusToVariant(s)`.
- **StatusBadge:** All status labels (Payé, Confirmée, En attente, Annulée, Refusée) and canal (Guichet/En ligne) use StatusBadge.
- **Preserved:** Theme on header and buttons; list item cards keep rounded-2xl and theme border for premium feel.

### 4. ClientMesBilletsPage.tsx

- **SectionCard:** "Recherche par téléphone", "Mon portefeuille" (noPad, right = billet count). Inner ticket list items unchanged (rounded-2xl cards with theme).
- **Preserved:** Wallet sections (À venir, Voyages effectués, Annulés), theme colors, CTA styling.

### 5. UploadPreuvePage.tsx

- **SectionCard:** Error/empty state ("Impossible de charger les données"), main form block ("Preuve de paiement"), ReservationSummaryCard ("Récapitulatif de votre réservation").
- **Preserved:** Amount, payment method selection, message, file upload, submit button; theme and primary color usage.

### 6. ReceiptEnLignePage.tsx

- **No changes.** No section-level card containers; sticky header and receipt content left as-is.

### 7. TicketOnline.tsx

- **No changes.** Ticket is a document-style component (ticket-force-light, rounded-2xl shadow-lg); converting to SectionCard would alter the ticket look. Kept as premium ticket UI.

### 8. ResultatsAgencePage.tsx

- **SectionCard:** Error state ("Erreur"), main content ("departure → arrival"), empty state ("Aucun trajet disponible"), time grid ("Choisissez votre heure de départ"). Removed `classes.card`; all blocks use SectionCard with `shadow-md`.
- **Preserved:** Date/time selection styling with theme, booking CTA, fixed bottom bar.

### 9. VilleSuggestionBar.tsx

- **SectionCard:** Wrapper for "Destinations populaires" grid (title from i18n). Inner suggestion cards remain rounded-xl with theme border/shadow for premium feel.
- **Preserved:** Grid layout, skeleton, empty state, CTA buttons with gradient.

## Validation

| Check | Result |
|-------|--------|
| Ad-hoc card containers in scope | Replaced with SectionCard where applicable. ReceiptEnLignePage and TicketOnline have no section cards to replace. |
| Status indicators | ReservationClientPage, ReservationDetailsPage, ClientMesReservationsPage use StatusBadge. ClientMesBilletsPage wallet badges left as theme-styled (state labels). |
| Spacing / density | SectionCards use default p-5; `shadow-md` used for public pages; no dense dashboard-style layout. |
| CTAs and theme | Primary/secondary and gradient buttons preserved; no change to conversion flow. |
| Layout shift | Section titles moved into SectionCard title bar; content area unchanged. No structural layout change beyond card chrome. |

## Files modified

**7:** ReservationClientPage.tsx, ReservationDetailsPage.tsx, ClientMesReservationsPage.tsx, ClientMesBilletsPage.tsx, UploadPreuvePage.tsx, ResultatsAgencePage.tsx, VilleSuggestionBar.tsx.

**Unchanged (no section cards to replace):** ReceiptEnLignePage.tsx, TicketOnline.tsx.
