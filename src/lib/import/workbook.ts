/**
 * Lee un archivo del usuario y lo deja en el formato que espera el importador.
 *
 * Corre en el navegador a propósito. El servidor recibe siempre texto delimitado
 * —lo mismo que un CSV— así que el xlsx no abre un segundo camino con su propia
 * validación: se traduce acá y entra por el mismo lugar que ya está probado.
 * De paso el archivo binario nunca viaja, que para una planilla de 5 MB es la
 * diferencia entre funcionar y no.
 *
 * La librería es `read-excel-file`: solo lectura y MIT. Se descartó el paquete
 * `xlsx` de npm porque su última publicación es de 2022 y arrastra CVEs
 * conocidos, y `exceljs` porque pesa ocho veces más para hacer además cosas que
 * no necesitamos (escribir).
 */

import { rowsToDelimited } from '@/server/services/import';

export type SheetInfo = { name: string; index: number };

export type LoadedWorkbook = {
  /** Las hojas del archivo. Un CSV siempre trae una sola. */
  sheets: SheetInfo[];
  /** Devuelve el contenido de una hoja como texto delimitado. */
  read: (sheetIndex: number) => Promise<string>;
};

const isSpreadsheet = (file: File) => /\.xlsx?$/i.test(file.name);

/**
 * Convierte una celda a texto.
 *
 * Las fechas se leen con getters **UTC**, no locales. Excel guarda las fechas
 * como número de serie sin zona horaria, y la librería las materializa a
 * medianoche UTC: en UTC-3, leer `2026-03-15T00:00:00Z` con `getDate()` devuelve
 * **14**. Toda la planilla entraría corrida un día, y en un servidor en UTC no
 * se notaría — es la misma familia del bug de `transactionDate` que ya nos
 * mordió una vez.
 *
 * Además se redondea al minuto: el serial de Excel es un float, así que las
 * 14:30 llegan como 14:29:59.999 y truncar daría las 14:29.
 *
 * Se serializan en ISO porque es lo que el motor lee sin ambigüedad — mandarlas
 * como `dd/MM` reintroduciría justo la duda que el parser resuelve.
 */
const cellToText = (value: unknown): string => {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    const rounded = new Date(Math.round(value.getTime() / 60000) * 60000);
    const year = rounded.getUTCFullYear();
    const month = String(rounded.getUTCMonth() + 1).padStart(2, '0');
    const day = String(rounded.getUTCDate()).padStart(2, '0');

    // Con hora solo si la celda la trae: una visita puede tener fecha y hora en
    // el mismo valor, pero una fecha sola no debe inventar las 00:00.
    const hours = rounded.getUTCHours();
    const minutes = rounded.getUTCMinutes();
    if (hours === 0 && minutes === 0) return `${year}-${month}-${day}`;

    return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${String(
      minutes
    ).padStart(2, '0')}`;
  }

  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  return String(value);
};

/**
 * Recorta las filas y columnas vacías del borde.
 *
 * Excel marca como "usadas" celdas que el usuario tocó y después borró, así que
 * una planilla de 40 filas puede reportar 900. Sin esto el preview mostraría
 * cientos de filas fantasma y el conteo mentiría.
 */
const trimEmpty = (rows: string[][]): string[][] => {
  const trimmed = rows.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (trimmed.length === 0) return [];

  let lastColumn = 0;
  for (const row of trimmed) {
    for (let index = row.length - 1; index >= 0; index--) {
      if (row[index].trim() !== '') {
        if (index > lastColumn) lastColumn = index;
        break;
      }
    }
  }

  return trimmed.map((row) => {
    const cells = row.slice(0, lastColumn + 1);
    while (cells.length <= lastColumn) cells.push('');
    return cells;
  });
};

export const loadWorkbook = async (file: File): Promise<LoadedWorkbook> => {
  if (!isSpreadsheet(file)) {
    // CSV/TSV: el archivo ya es texto delimitado, no hay nada que traducir.
    const text = await file.text();
    return {
      sheets: [{ name: file.name, index: 0 }],
      read: async () => text,
    };
  }

  // Import dinámico: la librería solo se descarga si el usuario sube un Excel.
  const { default: readXlsxFile } = await import('read-excel-file/browser');

  // Una sola lectura trae todas las hojas con su nombre y su contenido, así que
  // cambiar de hoja después no vuelve a abrir el archivo.
  const sheets = await readXlsxFile(file);

  return {
    sheets: sheets.map((sheet, index) => ({ name: sheet.sheet, index })),
    read: async (sheetIndex: number) =>
      rowsToDelimited(
        trimEmpty((sheets[sheetIndex]?.data ?? []).map((row) => row.map(cellToText)))
      ),
  };
};
