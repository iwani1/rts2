export const employeeImportHeaders = [
  'reference',
  'fullName',
  'telephone',
  'email',
  'homeAddress',
  'department',
  'workLocation',
  'shift',
  'approvedPickupLocation',
  'approvedDropoffLocation',
  'accountStatus',
  'transportEligible',
  'accessibilityNeeds',
  'notes',
] as const;

export { MAX_IMPORT_CSV_BYTES as MAX_EMPLOYEE_IMPORT_BYTES, MAX_IMPORT_CSV_ROWS as MAX_EMPLOYEE_IMPORT_ROWS } from '@/modules/imports/csv-constants';
