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

export { MAX_IMPORT_CSV_BYTES as MAX_CUSTOMER_IMPORT_BYTES, MAX_IMPORT_CSV_ROWS as MAX_CUSTOMER_IMPORT_ROWS } from '@/modules/imports/csv-constants';
