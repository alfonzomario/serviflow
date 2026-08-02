"use client"

import * as React from "react"
import { toast } from "sonner"
import { Bell, BellRing, FileText, Pencil, Plus, Trash2, X } from "lucide-react"

import { trpc } from "@/lib/trpc"
import { formatDateTime, toDateTimeLocalValue } from "@/lib/format"
import { usePermissions } from "@/hooks/usePermissions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Filter = "all" | "reminders"

export default function NotesPage() {
  const { can } = usePermissions()
  const canWrite = can("notes", "write")
  const utils = trpc.useUtils()

  const [filter, setFilter] = React.useState<Filter>("all")
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [content, setContent] = React.useState("")
  const [reminderAt, setReminderAt] = React.useState("")
  const [deleting, setDeleting] = React.useState<string | null>(null)

  const notes = trpc.notes.list.useQuery({
    ...(filter === "reminders" ? { withReminder: true } : {}),
  })

  const refresh = () => utils.notes.invalidate()

  const createNote = trpc.notes.create.useMutation({
    onSuccess: async () => {
      toast.success("Nota creada")
      await refresh()
      setFormOpen(false)
    },
    onError: (error) => toast.error(error.message),
  })

  const updateNote = trpc.notes.update.useMutation({
    onSuccess: async () => {
      toast.success("Nota actualizada")
      await refresh()
      setFormOpen(false)
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteNote = trpc.notes.delete.useMutation({
    onSuccess: async () => {
      toast.success("Nota eliminada")
      await refresh()
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setDeleting(null)
    },
  })

  // Takes the note off the header's due list without deleting it.
  const markSent = trpc.notes.markReminderSent.useMutation({
    onSuccess: async () => {
      toast.success("Recordatorio archivado")
      await refresh()
    },
    onError: (error) => toast.error(error.message),
  })

  function openNew() {
    setEditingId(null)
    setContent("")
    setReminderAt("")
    setFormOpen(true)
  }

  function openEdit(note: { id: string; content: string; reminderAt: Date | null }) {
    setEditingId(note.id)
    setContent(note.content)
    setReminderAt(note.reminderAt ? toDateTimeLocalValue(note.reminderAt) : "")
    setFormOpen(true)
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!content.trim()) return

    const payload = {
      content: content.trim(),
      reminderAt: reminderAt ? new Date(reminderAt) : null,
    }

    if (editingId) updateNote.mutate({ id: editingId, ...payload })
    else createNote.mutate(payload)
  }

  const items = notes.data?.items ?? []
  const now = new Date()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notas</h1>
          <p className="text-muted-foreground">
            Apuntes del negocio. Con fecha de recordatorio aparecen avisadas cuando vencen.
          </p>
        </div>

        {canWrite && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva nota
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          Todas
        </Button>
        <Button
          variant={filter === "reminders" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("reminders")}
        >
          <Bell className="mr-2 h-4 w-4" />
          Con recordatorio
        </Button>
      </div>

      {notes.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={filter === "reminders" ? "Sin recordatorios" : "Sin notas todavía"}
            description={
              filter === "reminders"
                ? "Ninguna nota tiene fecha de recordatorio."
                : "Anotá lo que no querés que se pierda: un pedido, un dato de acceso, algo a revisar."
            }
            {...(canWrite && filter === "all"
              ? { actionLabel: "Nueva nota", onAction: openNew }
              : {})}
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((note) => {
            const isDue = note.reminderAt !== null && new Date(note.reminderAt) <= now
            const isPendingReminder = isDue && note.reminderSentAt === null

            return (
              <Card
                key={note.id}
                className={isPendingReminder ? "border-amber-500/40 p-4" : "p-4"}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <p className="whitespace-pre-wrap text-sm">{note.content}</p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{note.createdBy.name}</span>
                      <span>{formatDateTime(note.createdAt)}</span>

                      {note.reminderAt && (
                        <Badge
                          variant="outline"
                          className={
                            isPendingReminder
                              ? "border-none bg-amber-500/10 text-amber-600"
                              : "border-none bg-slate-500/10"
                          }
                        >
                          {isPendingReminder ? (
                            <BellRing className="mr-1 h-3 w-3" />
                          ) : (
                            <Bell className="mr-1 h-3 w-3" />
                          )}
                          {isDue ? "Venció" : "Recuerda"} el{" "}
                          {formatDateTime(note.reminderAt)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      {isPendingReminder && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Archivar recordatorio"
                          disabled={markSent.isPending}
                          onClick={() => markSent.mutate({ id: note.id })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(note)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleting(note.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar nota" : "Nueva nota"}</DialogTitle>
            <DialogDescription>
              El recordatorio es opcional. Con fecha, la nota se marca como vencida cuando
              llega — la app no manda nada por su cuenta.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="content">Nota</Label>
              <Textarea
                id="content"
                rows={5}
                autoFocus
                placeholder="Llamar a Roberto por el presupuesto del depósito…"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reminderAt">Recordarme (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  id="reminderAt"
                  type="datetime-local"
                  value={reminderAt}
                  onChange={(event) => setReminderAt(event.target.value)}
                />
                {reminderAt && (
                  <Button type="button" variant="outline" onClick={() => setReminderAt("")}>
                    Quitar
                  </Button>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createNote.isPending || updateNote.isPending}
              >
                {createNote.isPending || updateNote.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="¿Eliminar esta nota?"
        description="No se puede deshacer desde la app."
        confirmLabel="Eliminar"
        variant="destructive"
        isPending={deleteNote.isPending}
        onConfirm={() => deleting && deleteNote.mutate({ id: deleting })}
      />
    </div>
  )
}
