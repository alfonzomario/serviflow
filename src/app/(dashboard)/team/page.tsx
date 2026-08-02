"use client"

import * as React from "react"
import { toast } from "sonner"
import { KeyRound, Pencil, Plus, UserX, Users } from "lucide-react"

import { trpc } from "@/lib/trpc"
import { formatDate } from "@/lib/format"
import { usePermissions } from "@/hooks/usePermissions"
import { emptyPermissionMatrix, type PermissionMatrix } from "@/server/lib/permissions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/shared/EmptyState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import {
  PermissionMatrixEditor,
  toMatrix,
} from "@/components/team/PermissionMatrixEditor"

const ROLES = [
  { value: "OWNER", label: "Dueño", hint: "Acceso total. No pasa por la matriz." },
  { value: "ADMIN", label: "Administrador", hint: "Permisos a medida, módulo por módulo." },
  { value: "OPERATOR", label: "Operador", hint: "Agenda, clientes y notas. Nunca finanzas ni ajustes." },
  { value: "CLIENT", label: "Cliente", hint: "Solo su propia ficha, desde el portal." },
] as const

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Plataforma",
  OWNER: "Dueño",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  CLIENT: "Cliente",
}

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-500/10 text-purple-600",
  OWNER: "bg-indigo-500/10 text-indigo-600",
  ADMIN: "bg-sky-500/10 text-sky-600",
  OPERATOR: "bg-emerald-500/10 text-emerald-600",
  CLIENT: "bg-slate-500/10 text-slate-600",
}

type FormState = {
  name: string
  email: string
  password: string
  role: "OWNER" | "ADMIN" | "OPERATOR" | "CLIENT"
  permissions: PermissionMatrix
  isActive: boolean
}

const blankForm = (): FormState => ({
  name: "",
  email: "",
  password: "",
  role: "OPERATOR",
  permissions: emptyPermissionMatrix(),
  isActive: true,
})

export default function TeamPage() {
  const { role } = usePermissions()
  // Creating and editing users is `ownerProcedure` on the server; mirror that
  // here so the page never offers a button the API will reject.
  const isOwner = role === "OWNER" || role === "SUPER_ADMIN"
  const utils = trpc.useUtils()

  const users = trpc.users.list.useQuery()

  const [formOpen, setFormOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormState>(blankForm)
  const [error, setError] = React.useState<string | null>(null)

  const [resetting, setResetting] = React.useState<{ id: string; name: string } | null>(null)
  const [newPassword, setNewPassword] = React.useState("")
  const [deactivating, setDeactivating] = React.useState<{ id: string; name: string } | null>(
    null
  )

  const refresh = () => utils.users.invalidate()

  const createUser = trpc.users.create.useMutation({
    onSuccess: async () => {
      toast.success("Usuario creado")
      await refresh()
      setFormOpen(false)
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  const updateUser = trpc.users.update.useMutation({
    onSuccess: async () => {
      toast.success("Usuario actualizado")
      await refresh()
      setFormOpen(false)
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  const resetPassword = trpc.users.resetPassword.useMutation({
    onSuccess: async () => {
      toast.success("Contraseña cambiada. La sesión anterior quedó cerrada.")
      setResetting(null)
      setNewPassword("")
    },
    onError: (mutationError) => toast.error(mutationError.message),
  })

  const deactivate = trpc.users.deactivate.useMutation({
    onSuccess: async () => {
      toast.success("Usuario desactivado")
      await refresh()
      setDeactivating(null)
    },
    onError: (mutationError) => {
      toast.error(mutationError.message)
      setDeactivating(null)
    },
  })

  function openNew() {
    setEditingId(null)
    setForm(blankForm())
    setError(null)
    setFormOpen(true)
  }

  function openEdit(user: {
    id: string
    name: string
    email: string
    role: string
    permissions: unknown
    isActive: boolean
  }) {
    setEditingId(user.id)
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role as FormState["role"],
      permissions: toMatrix(user.permissions),
      isActive: user.isActive,
    })
    setError(null)
    setFormOpen(true)
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (editingId) {
      updateUser.mutate({
        id: editingId,
        name: form.name,
        role: form.role,
        permissions: form.permissions,
        isActive: form.isActive,
      })
      return
    }

    createUser.mutate({
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      permissions: form.permissions,
    })
  }

  const items = users.data ?? []
  const selectedRole = ROLES.find((entry) => entry.value === form.role)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipo</h1>
          <p className="text-muted-foreground">
            Quién entra y qué puede tocar. Los usuarios se desactivan, nunca se borran, para
            que el historial siga teniendo sentido.
          </p>
        </div>

        {isOwner && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo usuario
          </Button>
        )}
      </div>

      {users.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Sin usuarios"
            description="Todavía no hay nadie más en el equipo."
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Último ingreso</TableHead>
                <TableHead>Estado</TableHead>
                {isOwner && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((user) => (
                <TableRow key={user.id} className={user.isActive ? "" : "opacity-50"}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`border-none ${ROLE_STYLES[user.role] ?? ""}`}
                    >
                      {ROLE_LABELS[user.role] ?? user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Nunca"}
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="outline" className="border-none bg-emerald-500/10 text-emerald-600">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-none bg-slate-500/10">
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>

                  {isOwner && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(user)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Cambiar contraseña"
                          onClick={() => setResetting({ id: user.id, name: user.name })}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {user.isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Desactivar"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeactivating({ id: user.id, name: user.name })}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Cambiar el rol o los permisos cierra las sesiones abiertas de esa persona."
                : "El email no se puede cambiar después."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                minLength={2}
              />
            </div>

            {!editingId && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña inicial</Label>
                  <Input
                    id="password"
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    required
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="role">Rol</Label>
              <Select
                value={form.role}
                onValueChange={(value) => setForm({ ...form, role: value as FormState["role"] })}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRole && (
                <p className="text-xs text-muted-foreground">{selectedRole.hint}</p>
              )}
            </div>

            {/* Only ADMIN resolves through the matrix; for the rest it would be
                a form that changes nothing. */}
            {form.role === "ADMIN" && (
              <div className="grid gap-2">
                <Label>Permisos</Label>
                <PermissionMatrixEditor
                  value={form.permissions}
                  onChange={(permissions) => setForm({ ...form, permissions })}
                />
              </div>
            )}

            {editingId && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
                Puede iniciar sesión
              </label>
            )}

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                {createUser.isPending || updateUser.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resetting)}
        onOpenChange={(open) => {
          if (!open) {
            setResetting(null)
            setNewPassword("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña de {resetting?.name}</DialogTitle>
            <DialogDescription>
              Se cierran todas las sesiones abiertas de esa persona. Pasale la nueva
              contraseña por fuera de la app.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <Input
              id="newPassword"
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetting(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={newPassword.length < 8 || resetPassword.isPending}
              onClick={() =>
                resetting &&
                resetPassword.mutate({ id: resetting.id, newPassword })
              }
            >
              {resetPassword.isPending ? "Guardando…" : "Cambiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`¿Desactivar a ${deactivating?.name}?`}
        description="Deja de poder entrar, pero su historial y las visitas que tiene asignadas quedan intactas. Se puede reactivar editándolo."
        confirmLabel="Desactivar"
        variant="destructive"
        isPending={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate({ id: deactivating.id })}
      />
    </div>
  )
}
