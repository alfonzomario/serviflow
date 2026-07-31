"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSession } from "next-auth/react"
import {
  LayoutDashboard,
  Calendar,
  Users,
  ClipboardList,
  Clock,
  DollarSign,
  History,
  FileText,
  MessageSquare,
  Settings,
  Database,
  Building,
  LogOut
} from "lucide-react"

interface SidebarProps {
  className?: string
  onClose?: () => void
}

export function Sidebar({ className, onClose }: SidebarProps) {
  const pathname = usePathname()
  // Mock session for now, ideally const { data: session } = useSession()
  const session = { user: { role: "OWNER", name: "Javier", email: "javier@serviflow.com" } }
  const role = session?.user?.role || "OWNER"

  const navigation = [
    {
      title: "Main",
      items: [
        { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["OWNER", "ADMIN"] },
        { name: "Agenda", href: "/agenda", icon: Calendar, roles: ["OWNER", "ADMIN", "OPERATOR"] },
      ]
    },
    {
      title: "Management",
      items: [
        { name: "Clients", href: "/clients", icon: Users, roles: ["OWNER", "ADMIN"] },
        { name: "Requests", href: "/requests", icon: ClipboardList, roles: ["OWNER", "ADMIN"] },
        { name: "Pending", href: "/pending", icon: Clock, roles: ["OWNER", "ADMIN"] },
      ]
    },
    {
      title: "Finance",
      items: [
        { name: "Finance", href: "/finance", icon: DollarSign, roles: ["OWNER", "ADMIN"] },
        { name: "History", href: "/history", icon: History, roles: ["OWNER", "ADMIN"] },
      ]
    },
    {
      title: "Tools",
      items: [
        { name: "Notes", href: "/notes", icon: FileText, roles: ["OWNER", "ADMIN", "OPERATOR"] },
        { name: "AI Advisor", href: "/ai", icon: MessageSquare, roles: ["OWNER", "ADMIN"] },
        { name: "Import Data", href: "/import", icon: Database, roles: ["OWNER", "ADMIN"] },
      ]
    },
    {
      title: "Admin",
      items: [
        { name: "Team", href: "/team", icon: Building, roles: ["OWNER", "ADMIN"] },
        { name: "Settings", href: "/settings", icon: Settings, roles: ["OWNER", "ADMIN"] },
      ]
    }
  ]

  // Filter items by role
  const filteredNav = navigation.map(group => ({
    ...group,
    items: group.items.filter(item => item.roles.includes(role))
  })).filter(group => group.items.length > 0)

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
          <button className="text-slate-500 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
