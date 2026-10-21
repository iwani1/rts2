export type PayRuleBasis = 'PER_COMPLETED_TRIP' | 'PER_BOARDING' | 'FLAT_PER_DAY';

export type PayRuleConfig = {
  basis: PayRuleBasis;
  ratePesewas: number;
  overtimeThresholdMinutesPerDay: number | null;
  overtimeRatePesewasPerHour: number | null;
};

export type DriverPayMetrics = {
  driverId: string;
  driverName: string;
  completedTrips: number;
  boardings: number;
  activeDays: number;
  /** Recorded minutes per active day, only from trips with both START and COMPLETE events. */
  timedDayMinutes: number[];
  tripsWithTiming: number;
  tripsWithoutTiming: number;
};

export type DriverPayLine = DriverPayMetrics & {
  basisUnits: number;
  basePesewas: number;
  overtimeMinutes: number;
  overtimePesewas: number;
  totalPesewas: number;
};

/**
 * FIN-06 / D-086: pay comes only from the configured rule. The basis unit
 * is counted from recorded work (completed trips, completed boardings or
 * active days); overtime is minutes beyond the rule's own daily threshold,
 * priced at the rule's own hourly rate — nothing is assumed.
 */
export function computeDriverPayLine(rule: PayRuleConfig, metrics: DriverPayMetrics): DriverPayLine {
  const basisUnits = rule.basis === 'PER_COMPLETED_TRIP'
    ? metrics.completedTrips
    : rule.basis === 'PER_BOARDING'
      ? metrics.boardings
      : metrics.activeDays;
  const basePesewas = basisUnits * rule.ratePesewas;
  let overtimeMinutes = 0;
  if (rule.overtimeThresholdMinutesPerDay !== null) {
    overtimeMinutes = metrics.timedDayMinutes.reduce(
      (sum, minutes) => sum + Math.max(0, minutes - (rule.overtimeThresholdMinutesPerDay as number)),
      0,
    );
  }
  const overtimePesewas = rule.overtimeRatePesewasPerHour !== null
    ? Math.round((overtimeMinutes * rule.overtimeRatePesewasPerHour) / 60)
    : 0;
  return {
    ...metrics,
    basisUnits,
    basePesewas,
    overtimeMinutes,
    overtimePesewas,
    totalPesewas: basePesewas + overtimePesewas,
  };
}

export function summarisePayrollLines(lines: DriverPayLine[]) {
  return {
    drivers: lines.length,
    basePesewas: lines.reduce((sum, line) => sum + line.basePesewas, 0),
    overtimePesewas: lines.reduce((sum, line) => sum + line.overtimePesewas, 0),
    totalPesewas: lines.reduce((sum, line) => sum + line.totalPesewas, 0),
    tripsWithoutTiming: lines.reduce((sum, line) => sum + line.tripsWithoutTiming, 0),
  };
}

export type PayrollTotals = ReturnType<typeof summarisePayrollLines>;

export function payrollRunCsv(run: {
  reference: string; periodStart: string; periodEnd: string;
  lines: DriverPayLine[];
}): string {
  const header = [
    'payroll_reference', 'period_start', 'period_end', 'driver_name',
    'completed_trips', 'boardings', 'active_days', 'basis_units',
    'base_pesewas', 'overtime_minutes', 'overtime_pesewas', 'total_pesewas',
  ];
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = run.lines.map((line) => [
    run.reference, run.periodStart, run.periodEnd, line.driverName,
    line.completedTrips, line.boardings, line.activeDays, line.basisUnits,
    line.basePesewas, line.overtimeMinutes, line.overtimePesewas, line.totalPesewas,
  ].map(escape).join(','));
  return [header.join(','), ...rows].join('\n') + '\n';
}
