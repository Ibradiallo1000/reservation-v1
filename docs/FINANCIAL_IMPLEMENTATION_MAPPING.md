# Financial Implementation Mapping

## Domain mapping (intended -> implemented)

- `supplierInvoices` -> `payables`
- `payment requests` -> `paymentProposals`
- `supplierPayments` -> `payPayable` (plus proposal approval path when threshold is exceeded)

## Service mapping

- Intended `createSupplierInvoice` -> `createPayable`
- Intended `approveSupplierInvoice` -> `approvePayable`
- Intended `rejectSupplierInvoice` -> `rejectPayable`
- Intended `createSupplierPayment` -> `payPayable`
- Intended `transferFunds` -> `transferBetweenAccounts` / `agencyDepositToBank` / `mobileToBankTransfer`

## Workflow mapping

Request -> Approval -> Payment -> financialMovement is implemented through:

- Expenses:
  - `createExpense` -> `approveExpense` / `rejectExpense` -> `payExpense` -> `recordMovementInTransaction`
- Supplier finance:
  - `createPayable` -> `approvePayable` / `rejectPayable` -> `payPayable`
  - High-risk payments route through `paymentProposals` and CEO approval before movement write.

## Role mapping

- `agency_manager` -> `chefAgence` or `superviseur`
- `CEO` -> `admin_compagnie`

## Notes

- No new `supplierInvoices` or `supplierPayments` collections were introduced.
- Existing payables domain is the single source of truth for supplier liabilities and payments.

