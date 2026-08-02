import { format } from "date-fns"
import { es } from "date-fns/locale"

/** Prisma Decimal columns arrive as objects; normalise before formatting. */
type Numeric = number | string | { toString(): string } | null | undefined

export const toNumber = (value: Numeric): number => {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return value
  const parsed = Number(value.toString())
  return Number.isNaN(parsed) ? 0 : parsed
}

export const formatCurrency = (value: Numeric, currency = "ARS") =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(toNumber(value))

export const formatDate = (value: Date | string, pattern = "dd/MM/yyyy") =>
  format(new Date(value), pattern, { locale: es })

/**
 * For Postgres `DATE` columns (Transaction.transactionDate). Prisma hands them
 * back as UTC midnight, so rendering them in a negative-offset timezone would
 * show the previous day. Read the UTC parts instead.
 */
export const formatDateOnly = (value: Date | string, pattern = "dd/MM/yyyy") => {
  const date = new Date(value)
  const local = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return format(local, pattern, { locale: es })
}

/** Value for a `<input type="date">` bound to a Postgres DATE column. */
export const toDateOnlyInputValue = (value: Date | string) =>
  new Date(value).toISOString().slice(0, 10)

export const formatDateTime = (value: Date | string) =>
  format(new Date(value), "dd/MM/yyyy HH:mm", { locale: es })

export const formatTime = (value: Date | string) =>
  format(new Date(value), "HH:mm", { locale: es })

/** "vie 15 de ago, 09:00" — used in list rows. */
export const formatLongDateTime = (value: Date | string) =>
  format(new Date(value), "EEE d 'de' MMM, HH:mm", { locale: es })

/** Argentine mobile numbers are stored raw; group them for display. */
export const formatPhone = (phone: string | null | undefined) => {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

/** Value for a datetime-local input, in the browser's local time. */
export const toDateTimeLocalValue = (value: Date | string) => {
  const date = new Date(value)
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}
