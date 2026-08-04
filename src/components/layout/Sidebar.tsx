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
  LogOut,
  Sparkles,
  CreditCard,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

interface SidebarProps {
  className?: string
  onClose?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({ className, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { can, isLoading } = usePermissions()

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
    {
      title: "Herramientas",
      items: [
        { name: "Asesor IA", href: "/ia", icon: Sparkles, module: "agenda", action: "read" },
        { name: "Notas", href: "/notes", icon: FileText, module: "notes", action: "read" },
        { name: "Importar", href: "/import", icon: Database, module: "settings", action: "write" },
      ],
    },
    {
      title: "Administración",
      items: [
        { name: "Facturación", href: "/facturacion", icon: CreditCard, module: "settings", action: "read" },
        { name: "Equipo", href: "/team", icon: Building, module: "team", action: "read" },
        { name: "Ajustes", href: "/settings", icon: Settings, module: "settings", action: "read" },
        { name: "Superadmin", href: "/superadmin", icon: ShieldCheck, module: "settings", action: "write" },
      ],
    },
  ]

  const filteredNav = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => can(item.module, item.action)),
    }))
    .filter((group) => group.items.length > 0)

  const userInitial = session?.user?.name?.charAt(0)?.toUpperCase() || "U"

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-[hsl(var(--sidebar-border))]",
        "bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--foreground))] transition-all duration-300 relative",
        isCollapsed ? "w-16" : "w-64",
        className
      )}
    >
      {/* Logo & Collapse Button */}
      <div className={cn(
        "flex h-14 shrink-0 items-center border-b border-[hsl(var(--sidebar-border))]",
        isCollapsed ? "justify-center px-2" : "justify-between px-4"
      )}>
        <Link
          href="/"
          className="flex items-center gap-2.5 font-extrabold text-lg text-white tracking-tight overflow-hidden"
          title="ServiFlow"
        >
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0
              bg-gradient-to-br from-blue-500 to-indigo-600
              shadow-lg shadow-indigo-500/30"
          >
            <span className="text-white text-sm font-black">S</span>
          </div>
          {!isCollapsed && <span className="truncate">ServiFlow</span>}
        </Link>

        {/* Toggle Flechita */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg border border-[hsl(var(--sidebar-border))]",
              "bg-[hsl(var(--secondary)/0.5)] text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--secondary))]",
              "transition-all duration-200 shadow-sm shrink-0",
              isCollapsed && "mt-1"
            )}
            title={isCollapsed ? "Expandir menú" : "Ocultar menú"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-y-auto py-4">
        {isLoading ? (
          <div className="space-y-2 px-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-8 rounded-xl bg-[hsl(var(--secondary))] animate-pulse",
                  isCollapsed ? "w-10 mx-auto" : "w-full"
                )}
              />
            ))}
          </div>
        ) : (
          <nav className={cn("space-y-5", isCollapsed ? "px-2" : "px-3")}>
            {filteredNav.map((group) => (
              <div key={group.title}>
                {!isCollapsed && (
                  <h4 className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.6)] truncate">
                    {group.title}
                  </h4>
                )}
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href
                    const Icon = item.icon
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          title={isCollapsed ? item.name : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-xl py-2 font-medium text-xs transition-all duration-150",
                            isCollapsed ? "justify-center px-2" : "px-3",
                            isActive
                              ? "bg-[hsl(var(--primary))] text-white font-bold shadow-md shadow-indigo-500/20"
                              : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-white"
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-indigo-400/80")} />
                          {!isCollapsed && <span className="truncate">{item.name}</span>}
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

      {/* Footer Profile & Logout */}
      <div className={cn(
        "p-3 border-t border-[hsl(var(--sidebar-border))]",
        isCollapsed ? "flex justify-center" : "flex items-center justify-between gap-2"
      )}>
        <div className={cn("flex items-center gap-2.5 min-w-0", isCollapsed && "justify-center")}>
          <div className="h-8 w-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-xs text-indigo-300 shrink-0">
            {userInitial}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{session?.user?.name || "Usuario"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{session?.user?.email}</p>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
