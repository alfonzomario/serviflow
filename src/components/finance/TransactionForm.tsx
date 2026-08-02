"use client"

import * as React from "react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
import { toDateOnlyInputValue } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const INCOME_CATEGORIES = ["Visita", "Venta de producto", "Otro ingreso"]
const EXPENSE_CATEGORIES = [
  "Insumos",
  "Combustible",
  "Sueldos",
  "Herramientas",
  "Impuestos",
  "Otro gasto",
]

const NO_CLIENT = "__none__"

/** Today, as yyyy-MM-dd in the user's own timezone. */
const todayInputValue = () => {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: {
    id: string
    type: "INCOME" | "EXPENSE"
    amount: number
    category: string | null
    transactionDate: Date | string
    notes: string | null
  } | null
}

export function TransactionForm({ open, onOpenChange, transaction }: TransactionFormProps) {
  const isEditing = Boolean(transaction)
  const utils = trpc.useUtils()
  const clients = trpc.clients.options.useQuery(undefined, { enabled: open && !isEditing })

  const [type, setType] = React.useState<"INCOME" | "EXPENSE">("EXPENSE")
  const [amount, setAmount] = React.useState("")
  const [category, setCategory] = React.useState("")
  const [date, setDate] = React.useState(todayInputValue)
  const [clientId, setClientId] = React.useState(NO_CLIENT)
  const [notes, setNotes] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setError(null)

    if (transaction) {
      setType(transaction.type)
      setAmount(String(transaction.amount))
      setCategory(transaction.category ?? "")
      setDate(toDateOnlyInputValue(transaction.transactionDate))
      setNotes(transaction.notes ?? "")
      return
    }

    setType("EXPENSE")
    setAmount("")
    setCategory("")
    setDate(todayInputValue())
    setClientId(NO_CLIENT)
    setNotes("")
  }, [open, transaction])

  const onSuccess = async (message: string) => {
    toast.success(message)
    await Promise.all([utils.transactions.invalidate(), utils.dashboard.invalidate()])
    onOpenChange(false)
  }

  const create = trpc.transactions.create.useMutation({
    onSuccess: () => onSuccess("Movimiento registrado"),
    onError: (mutationError) => setError(mutationError.message),
  })

  const update = trpc.transactions.update.useMutation({
    onSuccess: () => onSuccess("Movimiento actualizado"),
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("El monto tiene que ser mayor a cero")
      return
    }

    // Postgres DATE column: pin to UTC midnight so the stored day matches the
    // day the user picked, regardless of their offset.
    const transactionDate = new Date(`${date}T00:00:00.000Z`)

    if (isEditing) {
      update.mutate({
        id: transaction!.id,
        type,
        amount: parsedAmount,
        category: category || null,
        transactionDate,
        notes: notes || null,
      })
      return
    }

    create.mutate({
      type,
      amount: parsedAmount,
      category: category || null,
      transactionDate,
      clientId: clientId === NO_CLIENT ? null : clientId,
      notes: notes || null,
    })
  }

  const categories = type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const isSaving = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar movimiento" : "Nuevo movimiento"}</DialogTitle>
          <DialogDescription>
            Los ingresos de visitas completadas se registran solos; acá cargás el resto.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="type">Tipo</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as "INCOME" | "EXPENSE")
                  setCategory("")
                }}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Ingreso</SelectItem>
                  <SelectItem value="EXPENSE">Egreso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Monto</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                step={100}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="category">Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Elegí una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
          </div>

          {!isEditing && (
            <div className="grid gap-2">
              <Label htmlFor="client">Cliente (opcional)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>Sin cliente</SelectItem>
                  {clients.data?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
