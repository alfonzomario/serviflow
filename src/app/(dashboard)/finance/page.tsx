"use client"

import * as React from "react"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc"
import { formatCurrency, formatDate, formatDateOnly, toNumber } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { TransactionForm } from "@/components/finance/TransactionForm"

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

const ALL = "__all__"

type EditableTransaction = React.ComponentProps<typeof TransactionForm>["transaction"]

export default function FinancePage() {
  const [month, setMonth] = React.useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [type, setType] = React.useState(ALL)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<EditableTransaction>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const monthEnd = React.useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59),
    [month]
  )

  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.transactions.list.useQuery({
    startDate: month,
    endDate: monthEnd,
    type: type === ALL ? undefined : (type as "INCOME"),
    limit: 200,
  })
  const monthly = trpc.transactions.monthlySummary.useQuery({ months: 6 })

  const deleteTransaction = trpc.transactions.delete.useMutation({
    onSuccess: async () => {
      toast.success("Movimiento eliminado")
      await Promise.all([utils.transactions.invalidate(), utils.dashboard.invalidate()])
      setDeletingId(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setDeletingId(null)
    },
  })

  const shiftMonth = (delta: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))

  const summary = data?.summary
  const items = data?.items ?? []
  const maxBar = Math.max(
    1,
    ...(monthly.data?.flatMap((entry) => [entry.income, entry.expense]) ?? [0])
  )

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Finanzas</h1>
          <p className="text-muted-foreground">Ingresos y egresos del negocio.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo movimiento
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium capitalize">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            <SelectItem value="INCOME">Solo ingresos</SelectItem>
            <SelectItem value="EXPENSE">Solo egresos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ingresos</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">
                {summary ? formatCurrency(summary.income) : "—"}
              </p>
            </div>
            <ArrowUpCircle className="h-8 w-8 text-emerald-500" />
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Egresos</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">
                {summary ? formatCurrency(summary.expense) : "—"}
              </p>
            </div>
            <ArrowDownCircle className="h-8 w-8 text-red-500" />
          </CardContent>
        </Card>

        <Card
          className={
            summary && summary.balance < 0
              ? "border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5"
              : "border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5"
          }
        >
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Balance</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">
                {summary ? formatCurrency(summary.balance) : "—"}
              </p>
            </div>
            <Wallet className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
      </div>

      {monthly.data && monthly.data.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Últimos 6 meses</h2>
          <div className="flex h-48 gap-4">
            {monthly.data.map((entry) => (
              <div key={entry.month} className="flex flex-1 flex-col gap-1">
                {/* min-h-0 lets the bar track shrink so percentage heights resolve */}
                <div className="flex min-h-0 flex-1 items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t bg-emerald-500/60"
                    style={{ height: `${Math.max(2, (entry.income / maxBar) * 100)}%` }}
                    title={`Ingresos: ${formatCurrency(entry.income)}`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-red-500/60"
                    style={{ height: `${Math.max(2, (entry.expense / maxBar) * 100)}%` }}
                    title={`Egresos: ${formatCurrency(entry.expense)}`}
                  />
                </div>
                <span className="text-center text-xs text-muted-foreground">
                  {entry.month.slice(5)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500/60" /> Ingresos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500/60" /> Egresos
            </span>
          </div>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Sin movimientos este mes"
            description="Cargá un ingreso o egreso, o completá una visita con precio para que se registre solo."
            actionLabel="Nuevo movimiento"
            onAction={openNew}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((transaction) => {
                const isIncome = transaction.type === "INCOME"
                return (
                  <TableRow key={transaction.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDateOnly(transaction.transactionDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            isIncome
                              ? "border-none bg-emerald-500/10 text-emerald-600"
                              : "border-none bg-red-500/10 text-red-600"
                          }
                        >
                          {transaction.category ?? (isIncome ? "Ingreso" : "Egreso")}
                        </Badge>
                        {transaction.visit?.scheduledAt && (
                          <span className="text-xs text-muted-foreground">
                            Visita del {formatDate(transaction.visit.scheduledAt)}
                          </span>
                        )}
                      </div>
                      {transaction.notes && (
                        <p className="mt-1 text-xs text-muted-foreground">{transaction.notes}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{transaction.client?.name ?? "—"}</TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        isIncome ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {isIncome ? "+" : "−"}
                      {formatCurrency(transaction.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar movimiento"
                          onClick={() => {
                            setEditing({
                              id: transaction.id,
                              type: transaction.type,
                              amount: toNumber(transaction.amount),
                              category: transaction.category,
                              transactionDate: transaction.transactionDate,
                              notes: transaction.notes,
                            })
                            setFormOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar movimiento"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeletingId(transaction.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <TransactionForm open={formOpen} onOpenChange={setFormOpen} transaction={editing} />

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="¿Eliminar el movimiento?"
        description="Se marca como eliminado y deja de contar en los totales. Podés volver a cargarlo después."
        confirmLabel="Eliminar"
        variant="destructive"
        isPending={deleteTransaction.isPending}
        onConfirm={() => deletingId && deleteTransaction.mutate({ id: deletingId })}
      />
    </div>
  )
}
