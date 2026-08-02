"use client"

import { useSession } from "next-auth/react"
// permissions.ts holds pure functions with no server-only imports, so the same
// matrix logic runs on the client — the UI hides what the API would reject.
import { checkPermission, type Action, type Module } from "@/server/lib/permissions"

export function usePermissions() {
  const { data: session, status } = useSession()

  const isLoading = status === "loading"

  return {
    isLoading,
    role: session?.user?.role ?? null,
    // While the session resolves there is no matrix to consult. Reporting
    // `false` would blank the whole nav on every page load, so callers get
    // `isLoading` and decide whether to render a skeleton instead.
    can: (module: Module, action: Action) => checkPermission(session ?? null, module, action),
  }
}
