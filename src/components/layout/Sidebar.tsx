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
        "bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--foreground))]",
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center px-5 border-b border-[hsl(var(--sidebar-border))]">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-extrabold text-lg text-white tracking-tight"
        >
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0
              bg-gradient-to-br from-blue-500 to-indigo-600
              shadow-lg shadow-indigo-500/30"
          >
            <span className="text-white text-sm font-black">S</span>
          </div>
          ServiFlow
        </Link>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-4">
        {isLoading ? (
          <div className="space-y-2 px-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-8 rounded-xl bg-[hsl(var(--secondary))] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <nav className="space-y-5 px-3">
            {filteredNav.map((group) => (
              <div key={group.title}>
                <h4 className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.6)]">
                  {group.title}
                </h4>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                            isActive
                              ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--sidebar-active-text))] border border-[hsl(var(--primary)/0.2)] shadow-[inset_0_1px_0_hsl(var(--primary)/0.1)]"
                              : "text-[hsl(var(--muted-foreground)/0.8)] hover:bg-[hsl(var(--secondary)/0.6)] hover:text-[hsl(var(--foreground))]"
                          )}
                        >
                          {/* Active indicator bar */}
                          <div
                            className={cn(
                              "absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-full transition-all duration-200",
                              "bg-gradient-to-b from-blue-400 to-indigo-500",
                              isActive ? "h-5 opacity-100" : "h-0 opacity-0"
                            )}
                          />
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-colors duration-150",
                              isActive
                                ? "text-[hsl(var(--sidebar-active-text))]"
                                : "text-[hsl(var(--muted-foreground)/0.6)] group-hover:text-[hsl(var(--foreground)/0.8)]"
                            )}
                          />
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

      {/* User footer */}
      <div className="shrink-0 border-t border-[hsl(var(--sidebar-border))] p-3">
        <div
          className="flex items-center gap-3 rounded-xl p-3
            bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]"
        >
          {/* Avatar */}
          <div
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center font-bold text-white text-sm
              bg-gradient-to-br from-blue-500 to-indigo-600
              ring-2 ring-indigo-500/20"
          >
            {userInitial}
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold text-white leading-tight">
              {session?.user?.name}
            </p>
            <span
              className="inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full
                bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
            >
              {role}
            </span>
          </div>

          {/* Logout */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Cerrar sesión"
            className="text-[hsl(var(--muted-foreground)/0.6)] hover:text-white
              hover:bg-[hsl(var(--accent))] rounded-lg p-1.5 transition-all duration-150"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
