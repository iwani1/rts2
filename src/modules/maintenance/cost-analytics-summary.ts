export type FinishedWorkOrderCost = {
  vehicleId: string;
  registrationNumber: string;
  workType: string | null;
  labourPesewas: number | null;
  partsPesewas: number | null;
  otherPesewas: number | null;
  turnaroundDays: number | null;
};

export type ReportedFaultRow = {
  vehicleId: string;
  registrationNumber: string;
  workType: string | null;
  reportedFault: string;
};

function normalise(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export type MaintenanceCostAnalyticsSummary = {
  finishedWorkOrders: number;
  finishedWithAnyCost: number;
  spendByVehicle: Array<{
    vehicleId: string;
    registrationNumber: string;
    workOrderCount: number;
    withCostCount: number;
    labourPesewas: number;
    partsPesewas: number;
    otherPesewas: number;
    totalPesewas: number;
    repairDaysTotal: number;
    averageTurnaroundDays: number | null;
  }>;
  repairsByType: Array<{ workType: string; workOrderCount: number; totalPesewas: number }>;
  partsVsLabour: {
    labourPesewas: number;
    partsPesewas: number;
    otherPesewas: number;
    totalPesewas: number;
  };
  recurringWorkTypes: Array<{ registrationNumber: string; workType: string; occurrences: number }>;
  recurringFaults: Array<{ registrationNumber: string; reportedFault: string; occurrences: number }>;
};

/**
 * MNT-04 / D-083 pure aggregation. Only finished work orders with recorded
 * cost fields contribute spend; turnaround uses recorded report/completion
 * dates (repair days, not availability); recurring entries are factual
 * repeats of work type / fault text per vehicle.
 */
export function summariseMaintenanceCosts(input: {
  finished: FinishedWorkOrderCost[];
  reported: ReportedFaultRow[];
}): MaintenanceCostAnalyticsSummary {
  const byVehicle = new Map<string, MaintenanceCostAnalyticsSummary['spendByVehicle'][number] & { turnaroundCount: number }>();
  const byType = new Map<string, { workType: string; workOrderCount: number; totalPesewas: number }>();
  let labour = 0;
  let parts = 0;
  let other = 0;
  let finishedWithAnyCost = 0;

  for (const row of input.finished) {
    const rowTotal = (row.labourPesewas ?? 0) + (row.partsPesewas ?? 0) + (row.otherPesewas ?? 0);
    const hasCost = row.labourPesewas !== null || row.partsPesewas !== null || row.otherPesewas !== null;
    if (hasCost) finishedWithAnyCost += 1;
    labour += row.labourPesewas ?? 0;
    parts += row.partsPesewas ?? 0;
    other += row.otherPesewas ?? 0;

    const vehicle = byVehicle.get(row.vehicleId) ?? {
      vehicleId: row.vehicleId,
      registrationNumber: row.registrationNumber,
      workOrderCount: 0, withCostCount: 0,
      labourPesewas: 0, partsPesewas: 0, otherPesewas: 0, totalPesewas: 0,
      repairDaysTotal: 0, averageTurnaroundDays: null, turnaroundCount: 0,
    };
    vehicle.workOrderCount += 1;
    if (hasCost) vehicle.withCostCount += 1;
    vehicle.labourPesewas += row.labourPesewas ?? 0;
    vehicle.partsPesewas += row.partsPesewas ?? 0;
    vehicle.otherPesewas += row.otherPesewas ?? 0;
    vehicle.totalPesewas += rowTotal;
    if (row.turnaroundDays !== null) {
      vehicle.repairDaysTotal += row.turnaroundDays;
      vehicle.turnaroundCount += 1;
    }
    byVehicle.set(row.vehicleId, vehicle);

    const typeKey = normalise(row.workType) || 'not recorded';
    const type = byType.get(typeKey) ?? { workType: row.workType?.trim() || 'Not recorded', workOrderCount: 0, totalPesewas: 0 };
    type.workOrderCount += 1;
    type.totalPesewas += rowTotal;
    byType.set(typeKey, type);
  }

  const typeCounts = new Map<string, { registrationNumber: string; workType: string; occurrences: number }>();
  const faultCounts = new Map<string, { registrationNumber: string; reportedFault: string; occurrences: number }>();
  for (const row of input.reported) {
    const typeKey = normalise(row.workType);
    if (typeKey) {
      const key = `${row.vehicleId}|${typeKey}`;
      const entry = typeCounts.get(key) ?? { registrationNumber: row.registrationNumber, workType: row.workType?.trim() ?? typeKey, occurrences: 0 };
      entry.occurrences += 1;
      typeCounts.set(key, entry);
    }
    const faultKey = normalise(row.reportedFault);
    if (faultKey) {
      const key = `${row.vehicleId}|${faultKey}`;
      const entry = faultCounts.get(key) ?? { registrationNumber: row.registrationNumber, reportedFault: row.reportedFault.trim(), occurrences: 0 };
      entry.occurrences += 1;
      faultCounts.set(key, entry);
    }
  }

  const recurring = <T extends { occurrences: number }>(rows: T[]) => rows
    .filter((row) => row.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences);

  return {
    finishedWorkOrders: input.finished.length,
    finishedWithAnyCost,
    spendByVehicle: [...byVehicle.values()]
      .map(({ turnaroundCount, ...vehicle }) => ({
        ...vehicle,
        averageTurnaroundDays: turnaroundCount > 0
          ? Math.round((vehicle.repairDaysTotal / turnaroundCount) * 10) / 10
          : null,
      }))
      .sort((a, b) => b.totalPesewas - a.totalPesewas || a.registrationNumber.localeCompare(b.registrationNumber)),
    repairsByType: [...byType.values()]
      .sort((a, b) => b.totalPesewas - a.totalPesewas || a.workType.localeCompare(b.workType)),
    partsVsLabour: { labourPesewas: labour, partsPesewas: parts, otherPesewas: other, totalPesewas: labour + parts + other },
    recurringWorkTypes: recurring([...typeCounts.values()]),
    recurringFaults: recurring([...faultCounts.values()]),
  };
}
