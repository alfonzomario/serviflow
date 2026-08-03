"use client"

import * as React from "react"
import { toast } from "sonner"
import { Undo2 } from "lucide-react"

import { trpc } from "@/lib/trpc"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { ImportWizard } from "@/components/import/ImportWizard"

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PROCESSING: { label: "En curso", className: "bg-sky-500/10 text-sky-600" },
  COMPLETED: { label: "Completada", className: "bg-emerald-500/10 text-emerald-600" },
  COMPLETED_WITH_ERRORS: {
    label: "Con errores",
    className: "bg-amber-500/10 text-amber-600",
  },
  FAILED: { label: "Falló", className: "bg-red-500/10 text-red-600" },
  ROLLED_BACK: { label: "Deshecha", className: "bg-slate-500/10 text-slate-600" },
}

export default function ImportPage() {
  const utils = trpc.useUtils()
  const history = trpc.import.history.useQuery()

  const [undoing, setUndoing] = React.useState<{ id: string; rows: number } | null>(null)

  const rollback = trpc.import.rollback.useMutation({
    onSuccess: async (result) => {
      toast.success(`Se eliminaron ${result.deleted} registros`)
      await Promise.all([utils.import.invalidate(), utils.clients.invalidate()])
      setUndoing(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setUndoing(null)
    },
  })

  const items = history.data ?? []
  const activeItems = items.filter((entry) => entry.status !== "ROLLED_BACK")
  const rolledBackItems = items.filter((entry) => entry.status === "ROLLED_BACK")

  const ENTITY_LABELS: Record<string, string> = {
    clients: "Clientes",
    visits: "Visitas (Agenda)",
    transactions: "Movimientos (Cobros/Gastos)",
    requests: "Solicitudes",
    notes: "Notas de Clientes",
    users: "Equipo de trabajo",
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Importar datos</h1>
        <p className="text-muted-foreground">
          Traé tu información desde planillas de Excel. Se revisa todo antes de guardar y podés deshacer cualquier lote si es necesario.
        </p>
      </div>

      <ImportWizard onImported={() => history.refetch()} />

      {activeItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Importaciones activas</h2>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo de Datos</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead className="text-right">Registros creados</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeItems.map((entry) => {
                  const status = STATUS_LABELS[entry.status] ?? {
                    label: entry.status,
                    className: "",
                  }
                  const canUndo = entry.importedRows > 0
                  const entityName = ENTITY_LABELS[entry.entityType] ?? entry.entityType

                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(entry.startedAt)}
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        {entityName}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm">
                        {entry.fileName ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm tabular-nums font-medium">
                        {entry.importedRows} de {entry.totalRows}
                        {entry.skippedRows > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {entry.skippedRows} omitidos
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`border-none ${status.className}`}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canUndo && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-slate-700 hover:bg-red-500/10 hover:text-red-400"
                            onClick={() =>
                              setUndoing({ id: entry.id, rows: entry.importedRows })
                            }
                          >
                            <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                            Deshacer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      {rolledBackItems.length > 0 && (
        <details className="group space-y-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground select-none">
            ▸ Ver importaciones deshechas anteriores ({rolledBackItems.length})
          </summary>

          <Card className="overflow-x-auto mt-2 opacity-70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo de Datos</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead className="text-right">Filas procesadas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rolledBackItems.map((entry) => {
                  const entityName = ENTITY_LABELS[entry.entityType] ?? entry.entityType
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(entry.startedAt)}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{entityName}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs">
                        {entry.fileName ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                        {entry.importedRows} de {entry.totalRows}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-none bg-slate-500/10 text-slate-500 text-[10px]">
                          Deshecha
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </details>
      )}

      <ConfirmDialog
        open={Boolean(undoing)}
        onOpenChange={(open) => !open && setUndoing(null)}
        title="¿Deshacer esta importación?"
        description={`Se eliminan los ${undoing?.rows ?? 0} clientes que creó. Los que ya existían y se actualizaron no vuelven atrás: no guardamos cómo estaban antes.`}
        confirmLabel="Deshacer"
        variant="destructive"
        isPending={rollback.isPending}
        onConfirm={() => undoing && rollback.mutate({ importId: undoing.id })}
      />
    </div>
  )
}
