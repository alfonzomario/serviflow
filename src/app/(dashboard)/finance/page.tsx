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
  Clock,
  CheckCircle2,
  DollarSign,
  AlertCircle,
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
  const [filterType, setFilterType] = React.useState(ALL)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<EditableTransaction>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const monthEnd = React.useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59),
    [month]
  )

  const utils = trpc.useUtils()

  const typeParam = React.useMemo(() => {
    if (filterType === "INCOME" || filterType === "EXPENSE") return filterType
    return undefined
  }, [filterType])

  const isPaidParam = React.useMemo(() => {
    if (filterType === "COBRADO") return true
    if (filterType === "POR_COBRAR") return false
    return undefined
  }, [filterType])

  const { data, isLoading } = trpc.transactions.list.useQuery({
    startDate: month,
    endDate: monthEnd,
    type: typeParam,
    isPaid: isPaidParam,
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

  const togglePaid = trpc.transactions.togglePaid.useMutation({
    onSuccess: async (_, variables) => {
      toast.success(variables.isPaid ? "¡Cobro registrado correctamente!" : "Movimiento cambiado a Por cobrar")
      await Promise.all([utils.transactions.invalidate(), utils.dashboard.invalidate()])
    },
    onError: (err) => toast.error(err.message),
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
    <div className="space-y-6 relative pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Finanzas</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Administrá tu caja real, egresos y cuentas por cobrar.
          </p>
        </div>
        <Button onClick={openNew} className="shadow-md">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo movimiento
        </Button>
      </div>

      {/* Month Navigation & Type Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-bold capitalize">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </span>
          <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-52 font-semibold">
            <SelectValue placeholder="Filtrar movimientos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los movimientos</SelectItem>
            <SelectItem value="COBRADO">🟢 Solo cobrados</SelectItem>
            <SelectItem value="POR_COBRAR">🟠 Por cobrar</SelectItem>
            <SelectItem value="EXPENSE">🔴 Solo egresos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Cobrado Card */}
        <Card className="border-emerald-500/25 bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 shadow-xl shadow-emerald-500/10 hover:scale-[1.01] transition-transform">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Ingresos Cobrados</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
                {summary ? formatCurrency(summary.cobrado) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Dinero real en caja</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/15 shadow-lg shadow-emerald-500/20">
              <ArrowUpCircle className="h-6 w-6 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        {/* Por Cobrar Card */}
        <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/20 to-amber-600/5 shadow-xl shadow-amber-500/10 hover:scale-[1.01] transition-transform">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Por Cobrar</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
                {summary ? formatCurrency(summary.porCobrar) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Visitas realizadas pendientes</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/15 shadow-lg shadow-amber-500/20">
              <Clock className="h-6 w-6 text-amber-400" />
            </div>
          </CardContent>
        </Card>

        {/* Egresos Card */}
        <Card className="border-red-500/25 bg-gradient-to-br from-red-500/20 to-red-600/5 shadow-xl shadow-red-500/10 hover:scale-[1.01] transition-transform">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-400">Egresos / Gastos</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
                {summary ? formatCurrency(summary.expense) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Gastos operativos del mes</p>
            </div>
            <div className="p-3 rounded-xl bg-red-500/15 shadow-lg shadow-red-500/20">
              <ArrowDownCircle className="h-6 w-6 text-red-400" />
            </div>
          </CardContent>
        </Card>

        {/* Balance Real Card */}
        <Card
          className={
            summary && summary.balance < 0
              ? "border-red-500/25 bg-gradient-to-br from-red-500/20 to-red-600/5 shadow-xl shadow-red-500/10 hover:scale-[1.01] transition-transform"
              : "border-indigo-500/25 bg-gradient-to-br from-indigo-500/20 to-blue-600/5 shadow-xl shadow-indigo-500/10 hover:scale-[1.01] transition-transform"
          }
        >
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">Balance Real</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
                {summary ? formatCurrency(summary.balance) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Cobrado − Egresos</p>
            </div>
            <div className="p-3 rounded-xl bg-indigo-500/15 shadow-lg shadow-indigo-500/20">
              <Wallet className="h-6 w-6 text-indigo-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Chart */}
      {monthly.data && monthly.data.length > 0 && (
        <Card className="p-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg">
          <h2 className="mb-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Evolución de los Últimos 6 meses</h2>
          <div className="flex h-44 gap-4">
            {monthly.data.map((entry) => (
              <div key={entry.month} className="flex flex-1 flex-col gap-1">
                <div className="flex min-h-0 flex-1 items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400"
                    style={{ height: `${Math.max(2, (entry.income / maxBar) * 100)}%` }}
                    title={`Ingresos: ${formatCurrency(entry.income)}`}
                  />
                  <div
                    className="w-1/2 rounded-t-md bg-gradient-to-t from-red-600 to-red-400"
                    style={{ height: `${Math.max(2, (entry.expense / maxBar) * 100)}%` }}
                    title={`Egresos: ${formatCurrency(entry.expense)}`}
                  />
                </div>
                <span className="text-center text-xs font-semibold text-muted-foreground">
                  {entry.month.slice(5)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-4 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Ingresos Totales
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Egresos
            </span>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Sin movimientos registrados"
            description="Agendá ingresos o egresos, o marcá cobros de visitas completadas."
            actionLabel="Nuevo movimiento"
            onAction={openNew}
          />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Fecha</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Estado</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Concepto</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Cliente</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Monto</TableHead>
                <TableHead className="w-36 text-right py-3">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((transaction) => {
                const isIncome = transaction.type === "INCOME"
                const isPaid = transaction.isPaid !== false

                return (
                  <TableRow
                    key={transaction.id}
                    className={`border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors
                      ${isIncome ? (isPaid ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-amber-500") : "border-l-4 border-l-red-500"}`}
                  >
                    <TableCell className="whitespace-nowrap text-sm font-semibold">
                      {formatDateOnly(transaction.transactionDate)}
                    </TableCell>

                    {/* Estado Badge */}
                    <TableCell className="whitespace-nowrap">
                      {isIncome ? (
                        isPaid ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs font-bold gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            Cobrado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs font-bold gap-1 animate-pulse">
                            <Clock className="h-3 w-3 text-amber-500" />
                            Por cobrar
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs font-bold">
                          Egreso
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="secondary"
                          className="font-medium text-xs"
                        >
                          {transaction.category ?? (isIncome ? "Visita" : "Gasto")}
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

                    <TableCell className="text-sm font-medium">{transaction.client?.name ?? "—"}</TableCell>

                    <TableCell
                      className={`text-right font-extrabold text-base tabular-nums ${
                        isIncome ? (isPaid ? "text-emerald-400" : "text-amber-400") : "text-red-400"
                      }`}
                    >
                      {isIncome ? "+" : "−"}
                      {formatCurrency(transaction.amount)}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Direct Action Button to Register Payment */}
                        {isIncome && !isPaid && (
                          <Button
                            size="sm"
                            className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1"
                            disabled={togglePaid.isPending}
                            onClick={() => togglePaid.mutate({ id: transaction.id, isPaid: true })}
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                            Cobrar
                          </Button>
                        )}

                        {isIncome && isPaid && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-muted-foreground hover:text-amber-400"
                            disabled={togglePaid.isPending}
                            title="Deshacer cobro (volver a Por cobrar)"
                            onClick={() => togglePaid.mutate({ id: transaction.id, isPaid: false })}
                          >
                            Deshacer
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
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
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Eliminar movimiento"
                          onClick={() => setDeletingId(transaction.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Floating Action Button (FAB) for "+ Nuevo movimiento" */}
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
