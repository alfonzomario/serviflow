"use client"

import * as React from "react"
import Link from "next/link"
import { Plus, Search, Users, Pencil, Trash2, MapPin, Phone } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc"
import { useDebounce } from "@/hooks/useDebounce"
import { formatPhone } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import { ClientForm } from "@/components/clients/ClientForm"

const ALL = "__all__"
const PAGE_SIZE = 20

export default function ClientsPage() {
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState(ALL)
  const [relationshipType, setRelationshipType] = React.useState(ALL)
  const [page, setPage] = React.useState(1)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null)

  const debouncedSearch = useDebounce(search)

  // Any filter change invalidates the current page number.
  React.useEffect(() => setPage(1), [debouncedSearch, status, relationshipType])

  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.clients.list.useQuery({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: status === ALL ? undefined : (status as "ACTIVE"),
    relationshipType: relationshipType === ALL ? undefined : (relationshipType as "CONTRACT"),
  })

  const deleteClient = trpc.clients.delete.useMutation({
    onSuccess: async () => {
      toast.success("Cliente eliminado")
      await utils.clients.invalidate()
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setDeleting(null)
    },
  })

  function openNew() {
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(id: string) {
    setEditingId(id)
    setDialogOpen(true)
  }

  const hasFilters = Boolean(debouncedSearch) || status !== ALL || relationshipType !== ALL
  const items = data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {data ? `${data.total} cliente${data.total === 1 ? "" : "s"}` : "Cargando…"}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] p-4 backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, email, teléfono o dirección…"
              className="pl-9"
            />
          </div>
          <Select value={relationshipType} onValueChange={setRelationshipType}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="Vínculo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los vínculos</SelectItem>
              <SelectItem value="CONTRACT">Por contrato</SelectItem>
              <SelectItem value="ON_DEMAND">Ocasional</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los estados</SelectItem>
              <SelectItem value="ACTIVE">Activos</SelectItem>
              <SelectItem value="INACTIVE">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden shadow-lg bg-[hsl(var(--card))]">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? "Sin resultados" : "Todavía no hay clientes"}
            description={
              hasFilters
                ? "Probá con otros términos de búsqueda o limpiá los filtros."
                : "Cargá tu primer cliente para empezar a agendar visitas."
            }
            actionLabel={hasFilters ? undefined : "Nuevo cliente"}
            onAction={hasFilters ? undefined : openNew}
          />
        ) : (
          <Table>
            <TableHeader className="bg-[hsl(var(--secondary)/0.5)]">
              <TableRow className="border-b border-[hsl(var(--border))] hover:bg-transparent">
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] py-3">Cliente</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] py-3">Contacto</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] py-3">Servicios</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] py-3">Vínculo</TableHead>
                <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] py-3">Visitas</TableHead>
                <TableHead className="w-24" /></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((client) => (
                <TableRow
                  key={client.id}
                  className="border-b border-[hsl(var(--border)/0.5)] last:border-0
                    hover:bg-[hsl(var(--secondary)/0.4)] transition-colors cursor-pointer"
                >
                  <TableCell>
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-semibold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors duration-150"
                    >
                      {client.name}
                    </Link>
                    {client.address && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">{client.address}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {client.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {formatPhone(client.phone)}
                      </div>
                    )}
                    {client.email && (
                      <div className="text-xs text-muted-foreground">{client.email}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {client.serviceTypes.slice(0, 2).map((type) => (
                        <Badge key={type} variant="secondary"
                          className="font-medium text-[10px] rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]">
                          {type}
                        </Badge>
                      ))}
                      {client.serviceTypes.length > 2 && (
                        <Badge variant="outline" className="font-normal text-[10px] rounded-full border-[hsl(var(--border))]">
                          +{client.serviceTypes.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        client.relationshipType === "CONTRACT"
                          ? "border-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
                          : "border-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/20"
                      }
                    >
                      {client.relationshipType === "CONTRACT" ? "Contrato" : "Ocasional"}
                    </Badge>
                    {client.status === "INACTIVE" && (
                      <Badge variant="outline" className="ml-1 border-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {client._count.visits}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(client.id)}
                        aria-label={`Editar ${client.name}`}
                        className="rounded-lg hover:bg-blue-500/10 hover:text-blue-400 transition-all"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg text-destructive hover:bg-red-500/10 hover:text-red-400 transition-all"
                        aria-label={`Eliminar ${client.name}`}
                        onClick={() => setDeleting({ id: client.id, name: client.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {data.page} de {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <ClientForm open={dialogOpen} onOpenChange={setDialogOpen} clientId={editingId} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`¿Eliminar a ${deleting?.name}?`}
        description="El cliente deja de aparecer en listados y pendientes. Sus visitas y movimientos se conservan."
        confirmLabel="Eliminar"
        variant="destructive"
        isPending={deleteClient.isPending}
        onConfirm={() => deleting && deleteClient.mutate({ id: deleting.id })}
      />
    </div>
  )
}
