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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Importar datos</h1>
        <p className="text-muted-foreground">
          Traé tu base de clientes desde la planilla que ya usás. Se revisa todo antes de
          escribir nada, y se puede deshacer.
        </p>
      </div>

      <ImportWizard onImported={() => history.refetch()} />

      {items.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Importaciones anteriores</h2>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => {
                  const status = STATUS_LABELS[entry.status] ?? {
                    label: entry.status,
                    className: "",
                  }
                  const canUndo =
                    entry.status !== "ROLLED_BACK" && entry.importedRows > 0

                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(entry.startedAt)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm">
                        {entry.fileName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{entry.user.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
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
                            variant="ghost"
                            onClick={() =>
                              setUndoing({ id: entry.id, rows: entry.importedRows })
                            }
                          >
                            <Undo2 className="mr-2 h-4 w-4" />
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
