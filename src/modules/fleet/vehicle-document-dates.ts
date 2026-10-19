import type { VehicleRecord } from './vehicles';

export const vehicleDocumentTypes = ['Insurance', 'Roadworthiness', 'Vehicle Registration'] as const;
export type VehicleDocumentType = (typeof vehicleDocumentTypes)[number];

export type VehicleDocumentDate = {
  vehicleId: string;
  registrationNumber: string;
  make: string;
  model: string;
  documentType: VehicleDocumentType;
  expiryDate: string;
};

type VehicleDocumentDateSource = Pick<
  VehicleRecord,
  'id' | 'registrationNumber' | 'make' | 'model' | 'insuranceExpiresAt' | 'roadworthinessExpiresAt' | 'registrationExpiresAt'
>;

const dateFields = [
  { field: 'insuranceExpiresAt', documentType: 'Insurance' },
  { field: 'roadworthinessExpiresAt', documentType: 'Roadworthiness' },
  { field: 'registrationExpiresAt', documentType: 'Vehicle Registration' },
] as const;

/** Flatten only the manually recorded expiry dates. This does not infer validity or reminder status. */
export function getVehicleDocumentDates(
  vehicles: readonly VehicleDocumentDateSource[], documentTypeFilter?: VehicleDocumentType,
): VehicleDocumentDate[] {
  return vehicles.flatMap((vehicle) => dateFields.flatMap(({ field, documentType }) => {
    const expiryDate = vehicle[field];
    return expiryDate ? [{
      vehicleId: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      documentType,
      expiryDate,
    }] : [];
  })).filter((entry) => !documentTypeFilter || entry.documentType === documentTypeFilter)
    .sort((left, right) => left.expiryDate.localeCompare(right.expiryDate)
      || left.registrationNumber.localeCompare(right.registrationNumber)
      || left.documentType.localeCompare(right.documentType));
}
