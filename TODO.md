## Work log / remaining steps
- [x] Read `src/services/paymentService.ts` and identify that `createPayment` writes to `companies/{companyId}/payments` and `confirmPayment` creates ledger via `createFinancialTransaction`.
- [x] Read `src/modules/compagnie/treasury/financialTransactions.ts` to understand ledger writes and expected inputs.
- [x] Patch `src/modules/agence/services/guichetReservationService.ts` so that when finance/ledger side-effects fail due to Firestore security rules, reservation creation does **not** fail; it returns `resultReservationId` after logging debug.
- [x] Run `createPayment`/ledger side-effects errors no longer block reservation creation: `guichetReservationService` now returns `resultReservationId` after logging debug + marking finance_side_effects_failed.
- [ ] Run the guichet reservation payment flow to confirm the permission error no longer blocks reservation creation in practice.
- [ ] If the flow still breaks, wrap each side-effect step (createPayment, validateAndConfirmGuichetPayment, reservation doc update, logAgentHistoryEvent) with its own try/catch.
- [ ] After confirming product behavior, optionally fix the underlying security-rule mismatch by aligning `role` / `agencyId` / payload shape for the failing ledger write (requires knowing which collection and rule predicate rejects).


