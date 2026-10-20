const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export class InvalidAccraDateTimeError extends Error {
  constructor() {
    super('Enter a valid Africa/Accra date and time.');
    this.name = 'InvalidAccraDateTimeError';
  }
}

/** Converts an HTML datetime-local value as an Africa/Accra wall time, independent of the browser timezone. */
export function accraLocalDateTimeToISOString(value: string): string {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) throw new InvalidAccraDateTimeError();
  const [, year, month, day, hour, minute, second = '00', fraction = '0'] = match;
  if (Number(year) < 1000) throw new InvalidAccraDateTimeError();
  const normalized = `${year}-${month}-${day}T${hour}:${minute}:${second}.${fraction.padEnd(3, '0')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== normalized) throw new InvalidAccraDateTimeError();
  return date.toISOString();
}

export function formatAccraDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
  }).format(value instanceof Date ? value : new Date(value));
}
