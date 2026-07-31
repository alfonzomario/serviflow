import { formatInTimeZone, toDate } from 'date-fns-tz';
import { addDays as fnsAddDays, startOfMonth as fnsStartOfMonth, endOfMonth as fnsEndOfMonth, isWithinInterval } from 'date-fns';

export const toTenantTimezone = (date: Date | string | number, timezone: string): Date => {
  // Convert UTC to Tenant Timezone Date object
  const tzDate = toDate(date, { timeZone: timezone });
  return tzDate;
};

export const formatDate = (date: Date | string | number, formatStr: string, timezone: string): string => {
  return formatInTimeZone(date, timezone, formatStr);
};

export const getMonthRange = (year: number, month: number, timezone: string) => {
  // month is 0-indexed in JS (0 = Jan, 11 = Dec)
  const start = toTenantTimezone(new Date(Date.UTC(year, month, 1)), timezone);
  const end = fnsEndOfMonth(start);
  return { start, end };
};

export const isWithinWorkingHours = (
  date: Date,
  startHour: string, // format 'HH:mm' e.g. '09:00'
  endHour: string,   // format 'HH:mm' e.g. '18:00'
  timezone: string
): boolean => {
  const tenantDateStr = formatInTimeZone(date, timezone, 'yyyy-MM-dd HH:mm');
  const dateOnly = tenantDateStr.split(' ')[0];
  
  const start = toDate(`${dateOnly}T${startHour}:00`, { timeZone: timezone });
  const end = toDate(`${dateOnly}T${endHour}:00`, { timeZone: timezone });
  
  return isWithinInterval(date, { start, end });
};

export const addDays = (date: Date, amount: number): Date => {
  return fnsAddDays(date, amount);
};

export const startOfMonth = (date: Date): Date => {
  return fnsStartOfMonth(date);
};

export const endOfMonth = (date: Date): Date => {
  return fnsEndOfMonth(date);
};
