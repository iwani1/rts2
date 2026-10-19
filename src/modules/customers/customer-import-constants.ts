export const customerImportHeaders = [
  'displayName',
  'reference',
  'contactPerson',
  'telephone',
  'email',
  'billingDetails',
  'customerType',
  'status',
  'notes',
] as const;

export const MAX_CUSTOMER_IMPORT_BYTES = 2_000_000;
export const MAX_CUSTOMER_IMPORT_ROWS = 1_000;
