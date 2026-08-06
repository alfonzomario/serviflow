const BUENOS_AIRES_TIMEZONE = "America/Argentina/Buenos_Aires";
// Argentina no observa horario de verano desde 2009: el offset es siempre -03:00.
const BUENOS_AIRES_OFFSET = "-03:00";

function toBuenosAiresParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUENOS_AIRES_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const p = {} as Record<string, string>;
  for (const part of parts) p[part.type] = part.value;
  return p;
}

/** "2026-08-07T09:30:00" — hora de pared en Buenos Aires, sin offset. */
export function toBuenosAiresLocalString(date: Date) {
  const p = toBuenosAiresParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/**
 * "2026-08-07T09:30:00-03:00" — RFC3339 completo y sin ambigüedad. Usar esto
 * (no la variante sin offset) para el `dateTime` que se manda a la Google
 * Calendar API: un dateTime sin offset depende de que Google interprete bien
 * el campo `timeZone` acompañante, y esa interpretación no está garantizada.
 * Con el offset explícito el instante queda fijo sin importar cómo Google
 * lo procese.
 */
export function toBuenosAiresOffsetString(date: Date) {
  return `${toBuenosAiresLocalString(date)}${BUENOS_AIRES_OFFSET}`;
}

/** "20260807T093000" — formato ICS (sin separadores) para DTSTART/DTEND;TZID=. */
export function toBuenosAiresIcsString(date: Date) {
  const p = toBuenosAiresParts(date);
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

export { BUENOS_AIRES_TIMEZONE, BUENOS_AIRES_OFFSET };
