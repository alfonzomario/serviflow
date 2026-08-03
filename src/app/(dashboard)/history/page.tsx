"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, History } from "lucide-react"

import { trpc } from "@/lib/trpc"
import { formatDateTime } from "@/lib/format"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

const ALL = "__all__"

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creó",
  UPDATE: "Modificó",
  DELETE: "Eliminó",
  STATUS_CHANGE: "Cambió el estado",
  SCHEDULE: "Agendó",
  IMPORT: "Importó",
  ARCHIVE: "Archivó",
  LOGIN: "Ingresó",
}

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-600",
  UPDATE: "bg-sky-500/10 text-sky-600",
  DELETE: "bg-red-500/10 text-red-600",
  STATUS_CHANGE: "bg-amber-500/10 text-amber-600",
  SCHEDULE: "bg-indigo-500/10 text-indigo-600",
  IMPORT: "bg-purple-500/10 text-purple-600",
  ARCHIVE: "bg-slate-500/10 text-slate-600",
  LOGIN: "bg-slate-500/10 text-slate-600",
}

const ENTITY_LABELS: Record<string, string> = {
  visit: "Visita",
  job: "Trabajo",
  client: "Cliente",
  request: "Solicitud",
  transaction: "Movimiento",
  note: "Nota",
  user: "Usuario",
}

const ENTITY_OPTIONS = [
  "visit",
  "job",
  "client",
  "request",
  "transaction",
  "note",
  "user",
] as const

// LOGIN, SCHEDULE and ARCHIVE exist in `AuditAction` but nothing writes them
// yet, so they are not offered: a filter that can never match reads like a bug.
// Add them here when their call sites exist.
const ACTION_OPTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "STATUS_CHANGE",
  "IMPORT",
] as const

/** Renders the `changes` JSON as readable lines instead of dumping the blob. */
function Changes({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return <span>—</span>

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>

  return (
    <div className="space-y-0.5">
      {entries.map(([key, raw]) => {
        // recordAudit writes either a plain value or an {old, new} pair.
        const isDiff =
          raw !== null &&
          typeof raw === "object" &&
          !Array.isArray(raw) &&
          "old" in (raw as object) &&
          "new" in (raw as object)

        if (isDiff) {
          const diff = raw as { old: unknown; new: unknown }
          return (
            <div key={key} className="text-xs">
              <span className="text-muted-foreground">{key}: </span>
              <span className="line-through opacity-60">{String(diff.old ?? "—")}</span>
              {" → "}
              <span className="font-medium">{String(diff.new ?? "—")}</span>
            </div>
          )
        }

        return (
          <div key={key} className="text-xs">
            <span className="text-muted-foreground">{key}: </span>
            <span className="font-medium">{String(raw ?? "—")}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function HistoryPage() {
  const [page, setPage] = React.useState(1)
  const [entityType, setEntityType] = React.useState<string>(ALL)
  const [action, setAction] = React.useState<string>(ALL)
  const [userId, setUserId] = React.useState<string>(ALL)

  // Any filter change restarts paging, otherwise page 3 of the old result set
  // shows as empty against the new one.
  const setFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setPage(1)
  }

  const actors = trpc.history.actors.useQuery()
  const { data, isLoading } = trpc.history.list.useQuery({
    page,
    limit: 50,
    ...(entityType !== ALL && { entityType: entityType as (typeof ENTITY_OPTIONS)[number] }),
    ...(action !== ALL && { action: action as (typeof ACTION_OPTIONS)[number] }),
    ...(userId !== ALL && { userId }),
  })

  const items = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Historial</h1>
        <p className="text-muted-foreground">
          Quién hizo qué y cuándo. Se escribe solo, como efecto de las operaciones — no se
          puede editar ni borrar desde acá.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={entityType} onValueChange={setFilter(setEntityType)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Todo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todo</SelectItem>
            {ENTITY_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {ENTITY_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={action} onValueChange={setFilter(setAction)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Cualquier acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Cualquier acción</SelectItem>
            {ACTION_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {ACTION_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userId} onValueChange={setFilter(setUserId)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Cualquiera" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Cualquiera</SelectItem>
            {actors.data?.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={History}
            title="Sin movimientos"
            description="No hay nada registrado con estos filtros todavía."
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Cuándo</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Qué</TableHead>
                  <TableHead>Sobre</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.user?.name ?? (
                        <span className="text-muted-foreground">Sistema</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`border-none ${ACTION_STYLES[entry.action] ?? ""}`}
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                    </TableCell>
                    <TableCell>
                      <Changes value={entry.changes} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages} · {data?.total} movimientos
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
