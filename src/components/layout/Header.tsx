"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Bell, Search, Menu, MapPin, Phone } from "lucide-react"

import { trpc } from "@/lib/trpc"
import { usePermissions } from "@/hooks/usePermissions"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface HeaderProps {
  onMenuClick: () => void
}

/** Cómo se llama cada sección, para no decir "Dashboard" en todas. */
const SECTION_NAMES: Record<string, string> = {
  "/": "Panel",
  "/agenda": "Agenda",
  "/clients": "Clientes",
  "/requests": "Solicitudes",
  "/pending": "Pendientes",
  "/finance": "Finanzas",
  "/history": "Historial",
  "/notes": "Notas",
  "/team": "Equipo",
  "/settings": "Ajustes",
  "/import": "Importar",
  "/ia": "Asesor IA",
  "/facturacion": "Facturación",
  "/superadmin": "Superadmin",
  "/portal": "Portal del Cliente",
}


const sectionFor = (pathname: string) => {
  if (SECTION_NAMES[pathname]) return SECTION_NAMES[pathname]
  // Las rutas de detalle (/clients/xxx) heredan el nombre de su sección.
  const base = `/${pathname.split("/")[1] ?? ""}`
  return SECTION_NAMES[base] ?? ""
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { can } = usePermissions()

  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [inputFocused, setInputFocused] = React.useState(false)

  // Se espera a que deje de tipear para no pegarle a la base en cada tecla.
  const [debounced, setDebounced] = React.useState("")
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 150)
    return () => clearTimeout(timer)
  }, [query])

  const canSeeClients = can("clients", "read")
  const canSeeNotes = can("notes", "read")

  const results = trpc.clients.list.useQuery(
    { page: 1, limit: 6, search: debounced },
    { enabled: canSeeClients && debounced.length >= 1 }
  )

  // La campanita muestra lo que realmente venció, no un punto fijo.
  const reminders = trpc.notes.dueReminders.useQuery(undefined, {
    enabled: canSeeNotes,
    refetchInterval: 5 * 60 * 1000,
  })
  const dueCount = reminders.data?.length ?? 0

  const goTo = (href: string) => {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  const sectionName = sectionFor(pathname)

  return (
    <header
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4
        border-b border-[hsl(var(--border))]
        bg-[hsl(var(--sidebar-bg)/0.85)] backdrop-blur-xl
        px-4 sm:gap-6 sm:px-6"
    >
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden shrink-0 rounded-lg hover:bg-[hsl(var(--secondary))]"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Abrir el menú</span>
      </Button>

      {/* Breadcrumb */}
      <div className="hidden items-center gap-1.5 text-sm lg:flex">
        <span className="text-[hsl(var(--muted-foreground)/0.5)] font-medium">ServiFlow</span>
        {sectionName && (
          <>
            <span className="text-[hsl(var(--muted-foreground)/0.35)]">/</span>
            <span className="font-semibold text-[hsl(var(--foreground)/0.9)] tracking-tight">
              {sectionName}
            </span>
          </>
        )}
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Search */}
        {canSeeClients && (
          <Popover open={open && debounced.length >= 1} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Search
                  className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors duration-150 ${
                    inputFocused
                      ? "text-[hsl(var(--primary)/0.8)]"
                      : "text-[hsl(var(--muted-foreground)/0.5)]"
                  }`}
                />
                <Input
                  type="search"
                  placeholder="Buscar cliente…"
                  className={`pl-9 pr-3 py-1.5 text-sm rounded-lg border transition-all duration-300
                    bg-[hsl(var(--secondary))] border-[hsl(var(--border))]
                    placeholder:text-[hsl(var(--muted-foreground)/0.5)]
                    focus:ring-2 focus:ring-[hsl(var(--primary)/0.25)] focus:border-[hsl(var(--primary)/0.5)]
                    ${inputFocused ? "w-64 sm:w-72" : "w-44 sm:w-56"}`}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setOpen(true)
                  }}
                  onFocus={() => { setOpen(true); setInputFocused(true) }}
                  onBlur={() => setInputFocused(false)}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[320px] p-1.5 rounded-xl border border-[hsl(var(--border))]
                bg-[hsl(var(--card))] backdrop-blur-xl shadow-2xl shadow-black/30"
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              {results.isFetching && (
                <p className="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">Buscando…</p>
              )}
              {!results.isFetching && (results.data?.items.length ?? 0) === 0 && (
                <p className="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                  Sin resultados para &ldquo;{debounced}&rdquo;.
                </p>
              )}
              {results.data?.items.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => goTo(`/clients/${client.id}`)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left
                    hover:bg-[hsl(var(--secondary))] transition-colors duration-100"
                >
                  <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {client.name}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-[hsl(var(--muted-foreground))]">
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {client.phone}
                      </span>
                    )}
                    {client.address && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {client.address}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* Notifications bell */}
        {canSeeNotes && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative shrink-0 rounded-lg hover:bg-[hsl(var(--secondary))]
                  text-[hsl(var(--muted-foreground)/0.7)] hover:text-[hsl(var(--foreground))]"
                aria-label={
                  dueCount > 0
                    ? `${dueCount} ${dueCount === 1 ? "recordatorio vencido" : "recordatorios vencidos"}`
                    : "Sin recordatorios vencidos"
                }
              >
                <Bell className="h-4.5 w-4.5" />
                {dueCount > 0 && (
                  <span
                    className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-red-500
                      ring-2 ring-[hsl(var(--sidebar-bg))] animate-pulse"
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[320px] p-1.5 rounded-xl border border-[hsl(var(--border))]
                bg-[hsl(var(--card))] backdrop-blur-xl shadow-2xl shadow-black/30"
            >
              <div className="px-3 py-2 border-b border-[hsl(var(--border))] mb-1">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Recordatorios vencidos
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  La app no manda nada por su cuenta: te los muestra acá.
                </p>
              </div>
              {dueCount === 0 ? (
                <p className="px-3 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                  No hay ninguno vencido. ✓
                </p>
              ) : (
                <>
                  {reminders.data?.slice(0, 5).map((note) => (
                    <div
                      key={note.id}
                      className="rounded-lg px-3 py-2 hover:bg-[hsl(var(--secondary))] transition-colors"
                    >
                      <p className="line-clamp-2 text-sm text-[hsl(var(--foreground))]">
                        {note.content}
                      </p>
                      {note.reminderAt && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                          Venció el {formatDate(note.reminderAt)}
                        </p>
                      )}
                    </div>
                  ))}
                  <Link
                    href="/notes"
                    className="block rounded-lg px-3 py-2 text-sm font-semibold
                      text-[hsl(var(--primary))] hover:bg-[hsl(var(--secondary))] transition-colors"
                  >
                    Ver todas las notas →
                  </Link>
                </>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </header>
  )
}
