import { describe, expect, it } from 'vitest';
import {
  computeDriverPayLine,
  payrollRunCsv,
  summarisePayrollLines,
  type DriverPayMetrics,
} from './driver-pay-computation';

const metrics: DriverPayMetrics = {
  driverId: 'd1', driverName: 'Ama Serwaa',
  completedTrips: 4, boardings: 90, activeDays: 3,
  timedDayMinutes: [700, 500, 660], tripsWithTiming: 4, tripsWithoutTiming: 0,
};

describe('driver pay computation (FIN-06 / D-086)', () => {
  it('pays only from the configured basis and rate', () => {
    const perTrip = computeDriverPayLine(
      { basis: 'PER_COMPLETED_TRIP', ratePesewas: 5000, overtimeThresholdMinutesPerDay: null, overtimeRatePesewasPerHour: null },
      metrics,
    );
    expect(perTrip).toMatchObject({ basisUnits: 4, basePesewas: 20000, overtimePesewas: 0, totalPesewas: 20000 });
    const perBoarding = computeDriverPayLine(
      { basis: 'PER_BOARDING', ratePesewas: 100, overtimeThresholdMinutesPerDay: null, overtimeRatePesewasPerHour: null },
      metrics,
    );
    expect(perBoarding.basePesewas).toBe(9000);
    const perDay = computeDriverPayLine(
      { basis: 'FLAT_PER_DAY', ratePesewas: 12000, overtimeThresholdMinutesPerDay: null, overtimeRatePesewasPerHour: null },
      metrics,
    );
    expect(perDay.basePesewas).toBe(36000);
  });

  it('prices overtime only beyond the rule threshold from recorded minutes', () => {
    const line = computeDriverPayLine(
      { basis: 'PER_COMPLETED_TRIP', ratePesewas: 5000, overtimeThresholdMinutesPerDay: 600, overtimeRatePesewasPerHour: 3000 },
      metrics,
    );
    // (700-600) + 0 + (660-600) = 160 minutes at GH₵30/hour -> 8000 pesewas
    expect(line.overtimeMinutes).toBe(160);
    expect(line.overtimePesewas).toBe(8000);
    expect(line.totalPesewas).toBe(28000);
    const noOvertimeConfigured = computeDriverPayLine(
      { basis: 'PER_COMPLETED_TRIP', ratePesewas: 5000, overtimeThresholdMinutesPerDay: null, overtimeRatePesewasPerHour: null },
      metrics,
    );
    expect(noOvertimeConfigured.overtimeMinutes).toBe(0);
  });

  it('summarises runs and exports final payroll CSV', () => {
    const line = computeDriverPayLine(
      { basis: 'PER_COMPLETED_TRIP', ratePesewas: 5000, overtimeThresholdMinutesPerDay: 600, overtimeRatePesewasPerHour: 3000 },
      metrics,
    );
    expect(summarisePayrollLines([line])).toEqual({
      drivers: 1, basePesewas: 20000, overtimePesewas: 8000, totalPesewas: 28000, tripsWithoutTiming: 0,
    });
    const csv = payrollRunCsv({
      reference: 'PAYRUN-0123456789ABCDEF', periodStart: '2027-09-01', periodEnd: '2027-09-30', lines: [line],
    });
    expect(csv).toContain('driver_name');
    expect(csv).toContain('Ama Serwaa');
    expect(csv).toContain(',28000');
  });
});
