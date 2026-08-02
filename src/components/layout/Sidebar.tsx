"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { signOut, useSession } from "next-auth/react"
import { usePermissions } from "@/hooks/usePermissions"
import type { Action, Module } from "@/server/lib/permissions"
import {
  LayoutDashboard,
  Calendar,
  Users,
  ClipboardList,
  Clock,
  DollarSign,
  History,
  FileText,
  Database,
  Settings,
  Building,
  LogOut
} from "lucide-react"

interface SidebarProps {
  className?: string
  onClose?: () => void
}

export function Sidebar({ className, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { can, isLoading } = usePermissions()
  const role = session?.user?.role ?? ""

  // Each entry declares the permission cell that gates it, so the nav matches
  // exactly what the tRPC procedures will allow.
  const navigation: {
    title: string
    items: {
      name: string
      href: string
      icon: typeof LayoutDashboard
      module: Module
      action: Action
    }[]
  }[] = [
    {
      title: "Principal",
      items: [
        { name: "Panel", href: "/", icon: LayoutDashboard, module: "agenda", action: "read" },
        { name: "Agenda", href: "/agenda", icon: Calendar, module: "agenda", action: "read" },
      ],
    },
    {
      title: "Gestión",
      items: [
        { name: "Clientes", href: "/clients", icon: Users, module: "clients", action: "read" },
        { name: "Solicitudes", href: "/requests", icon: ClipboardList, module: "requests", action: "read" },
        { name: "Pendientes", href: "/pending", icon: Clock, module: "agenda", action: "read" },
      ],
    },
    {
      title: "Finanzas",
      items: [
        { name: "Finanzas", href: "/finance", icon: DollarSign, module: "finance", action: "read" },
        { name: "Historial", href: "/history", icon: History, module: "agenda", action: "read" },
      ],
    },
    // Asesor IA (/ai) todavía no existe como página: el router está stub. Se
    // agrega acá cuando exista — un link a un 404 es peor que no tener el link.
    {
      title: "Herramientas",
      items: [
        { name: "Notas", href: "/notes", icon: FileText, module: "notes", action: "read" },
        { name: "Importar", href: "/import", icon: Database, module: "settings", action: "write" },
      ],
    },
    {
      title: "Administración",
      items: [
        { name: "Equipo", href: "/team", icon: Building, module: "team", action: "read" },
        { name: "Ajustes", href: "/settings", icon: Settings, module: "settings", action: "read" },
      ],
    },
  ]

  const filteredNav = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => can(item.module, item.action)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className={cn("flex h-full flex-col bg-slate-950 text-slate-200", className)}>
      <div className="flex h-16 items-center px-6 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-white">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-white">S</span>
          </div>
          ServiFlow
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4 scrollbar-thin scrollbar-thumb-slate-800">
        {isLoading ? (
          <div className="space-y-2 px-6">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-8 animate-pulse rounded-md bg-slate-900" />
            ))}
          </div>
        ) : (
        <nav className="space-y-6 px-4">
          {filteredNav.map((group) => (
            <div key={group.title}>
              <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {group.title}
              </h4>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-indigo-500/10 text-indigo-400"
                            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                        )}
                      >
                        <div className={cn(
                          "absolute left-0 h-8 w-1 rounded-r-full bg-indigo-500 transition-all duration-200",
                          isActive ? "opacity-100" : "opacity-0"
                        )} />
                        <item.icon className={cn("h-4 w-4", isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300")} />
                        {item.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        )}
      </div>

      <div className="border-t border-slate-800 p-4">
        <div className="flex items-center gap-3 rounded-lg bg-slate-900 p-3">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white uppercase">
            {session?.user?.name?.charAt(0) || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-white">{session?.user?.name}</p>
            <p className="truncate text-xs text-slate-400">{role}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Cerrar sesión"
            className="text-slate-500 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
