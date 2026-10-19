export const vehicleImportHeaders = [
  'registrationNumber', 'make', 'model', 'category', 'seatCount', 'fuelType', 'ownershipType',
  'odometerValue', 'odometerUnit', 'insuranceExpiresAt', 'roadworthinessExpiresAt',
  'registrationExpiresAt', 'nextServiceAt', 'notes',
] as const;

export type VehicleImportFields = Record<(typeof vehicleImportHeaders)[number], string>;
