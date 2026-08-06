/** Google Calendar's fixed event-color palette (colorId 1-11), as returned by the colors().get() endpoint. */
export const GOOGLE_CALENDAR_EVENT_COLORS = [
  { id: "1", name: "Lavanda", hex: "#7986cb" },
  { id: "2", name: "Salvia", hex: "#33b679" },
  { id: "3", name: "Uva", hex: "#8e24aa" },
  { id: "4", name: "Flamenco", hex: "#e67c73" },
  { id: "5", name: "Banana", hex: "#f6c026" },
  { id: "6", name: "Mandarina", hex: "#f5511d" },
  { id: "7", name: "Pavo real", hex: "#039be5" },
  { id: "8", name: "Grafito", hex: "#616161" },
  { id: "9", name: "Arándano", hex: "#3f51b5" },
  { id: "10", name: "Albahaca", hex: "#0b8043" },
  { id: "11", name: "Tomate", hex: "#d60000" },
] as const;

export const DEFAULT_GOOGLE_CALENDAR_COLOR_ID = "9";
export const DEFAULT_GOOGLE_CALENDAR_NAME = "ServiFlow";
