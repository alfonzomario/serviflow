"use client"

import {
  MODULES,
  MODULE_ACTIONS,
  emptyPermissionMatrix,
  type Action,
  type Module,
  type PermissionMatrix,
} from "@/server/lib/permissions"

const MODULE_LABELS: Record<Module, string> = {
  agenda: "Agenda y pendientes",
  clients: "Clientes",
  requests: "Solicitudes",
  finance: "Finanzas",
  team: "Equipo",
  notes: "Notas",
  ai: "Asesor IA",
  settings: "Ajustes",
  archive: "Archivado",
}

const ACTION_LABELS: Record<Action, string> = {
  read: "Ver",
  write: "Editar",
  execute: "Ejecutar",
}

/**
 * Editor for the granular matrix stored in `users.permissions`.
 *
 * Only ADMIN reads it — every other role resolves through the hardcoded rules
 * in `checkPermission`, so the form hides this section for them rather than
 * showing switches that would have no effect.
 */
export function PermissionMatrixEditor({
  value,
  onChange,
}: {
  value: PermissionMatrix
  onChange: (next: PermissionMatrix) => void
}) {
  const toggle = (module: Module, action: Action, checked: boolean) => {
    // The matrix is a union of differently-shaped cells per module, so it is
    // narrowed the same way `parsePermissions` does: clone, then write through
    // a Record view.
    const next: PermissionMatrix = { ...value, [module]: { ...value[module] } }
    const cell = next[module] as Record<string, boolean>

    cell[action] = checked

    // Editing without seeing is not a state the API can express, so keep the
    // pair coherent here instead of letting the user build it. Guarded by what
    // the module actually supports: `ai` is read-only, `archive` execute-only.
    const supports = (candidate: Action) => MODULE_ACTIONS[module].includes(candidate)

    if (action === "write" && checked && supports("read")) cell.read = true
    if (action === "read" && !checked && supports("write")) cell.write = false

    onChange(next)
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-md border">
        {MODULES.map((module, index) => (
          <div
            key={module}
            className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2 ${
              index > 0 ? "border-t" : ""
            }`}
          >
            <span className="text-sm">{MODULE_LABELS[module]}</span>

            <div className="flex gap-4">
              {MODULE_ACTIONS[module].map((action) => {
                const checked =
                  (value[module] as Record<string, boolean | undefined>)[action] === true

                return (
                  <label
                    key={action}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={checked}
                      onChange={(event) => toggle(module, action, event.target.checked)}
                    />
                    {ACTION_LABELS[action]}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Marcar &ldquo;Editar&rdquo; habilita &ldquo;Ver&rdquo; solo; desmarcar &ldquo;Ver&rdquo;
        quita ambos.
      </p>
    </div>
  )
}

/** Narrows the untyped `permissions` JSON coming back from the API. */
export const toMatrix = (value: unknown): PermissionMatrix => {
  const matrix = emptyPermissionMatrix()
  if (!value || typeof value !== "object" || Array.isArray(value)) return matrix

  for (const module of MODULES) {
    const stored = (value as Record<string, unknown>)[module]
    if (!stored || typeof stored !== "object") continue
    for (const action of MODULE_ACTIONS[module]) {
      if ((stored as Record<string, unknown>)[action] === true) {
        ;(matrix[module] as Record<string, boolean>)[action] = true
      }
    }
  }

  return matrix
}
