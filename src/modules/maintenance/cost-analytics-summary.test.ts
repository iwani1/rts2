import { describe, expect, it } from 'vitest';
import { summariseMaintenanceCosts } from './cost-analytics-summary';

describe('maintenance cost analytics (MNT-04 / D-083)', () => {
  const finished = [
    { vehicleId: 'v1', registrationNumber: 'GR-100-24', workType: 'Brakes', labourPesewas: 10000, partsPesewas: 30000, otherPesewas: null, turnaroundDays: 4 },
    { vehicleId: 'v1', registrationNumber: 'GR-100-24', workType: ' brakes ', labourPesewas: null, partsPesewas: null, otherPesewas: null, turnaroundDays: 2 },
    { vehicleId: 'v2', registrationNumber: 'GR-200-24', workType: 'Engine', labourPesewas: 50000, partsPesewas: 20000, otherPesewas: 5000, turnaroundDays: null },
  ];
  const reported = [
    { vehicleId: 'v1', registrationNumber: 'GR-100-24', workType: 'Brakes', reportedFault: 'Brake pedal soft' },
    { vehicleId: 'v1', registrationNumber: 'GR-100-24', workType: 'Brakes', reportedFault: 'brake  pedal soft' },
    { vehicleId: 'v1', registrationNumber: 'GR-100-24', workType: 'Tyres', reportedFault: 'Slow puncture' },
    { vehicleId: 'v2', registrationNumber: 'GR-200-24', workType: 'Brakes', reportedFault: 'Brake pedal soft' },
  ];

  it('sums recorded spend by vehicle with cost coverage and turnaround', () => {
    const result = summariseMaintenanceCosts({ finished, reported });
    expect(result.finishedWorkOrders).toBe(3);
    expect(result.finishedWithAnyCost).toBe(2);
    expect(result.partsVsLabour).toEqual({
      labourPesewas: 60000, partsPesewas: 50000, otherPesewas: 5000, totalPesewas: 115000,
    });
    const v1 = result.spendByVehicle.find((row) => row.vehicleId === 'v1');
    expect(v1).toMatchObject({ workOrderCount: 2, withCostCount: 1, totalPesewas: 40000, repairDaysTotal: 6, averageTurnaroundDays: 3 });
  });

  it('groups repairs by normalised type and counts recurring faults per vehicle', () => {
    const result = summariseMaintenanceCosts({ finished, reported });
    expect(result.repairsByType.find((row) => row.workType === 'Brakes')?.workOrderCount).toBe(2);
    expect(result.recurringWorkTypes).toEqual([
      { registrationNumber: 'GR-100-24', workType: 'Brakes', occurrences: 2 },
    ]);
    expect(result.recurringFaults).toEqual([
      { registrationNumber: 'GR-100-24', reportedFault: 'Brake pedal soft', occurrences: 2 },
    ]);
  });

  it('never treats missing cost fields as recorded spend', () => {
    const result = summariseMaintenanceCosts({
      finished: [finished[1]], reported: [],
    });
    expect(result.finishedWithAnyCost).toBe(0);
    expect(result.partsVsLabour.totalPesewas).toBe(0);
  });
});
