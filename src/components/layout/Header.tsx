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

  // Se espera a que deje de tipear para no pegarle a la base en cada tecla.
  const [debounced, setDebounced] = React.useState("")
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const canSeeClients = can("clients", "read")
  const canSeeNotes = can("notes", "read")

  const results = trpc.clients.list.useQuery(
    { page: 1, limit: 6, search: debounced },
    { enabled: canSeeClients && debounced.length >= 2 }
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

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-md sm:gap-6 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Abrir el menú</span>
      </Button>

      <div className="flex flex-1 items-center gap-4 lg:gap-6">
        <div className="hidden items-center text-sm font-medium text-muted-foreground lg:flex">
          <span>{sectionFor(pathname)}</span>
        </div>

        <div className="ml-auto flex w-full max-w-sm items-center space-x-2 sm:w-auto sm:space-x-4">
          {canSeeClients && (
            <Popover open={open && debounced.length >= 2} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Buscar un cliente…"
                    className="w-full bg-muted/50 pl-9 md:w-[300px]"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setOpen(true)
                    }}
                    onFocus={() => setOpen(true)}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[320px] p-1"
                // Que el foco se quede en el input: si se lo lleva el popover,
                // seguir tipeando cierra la lista.
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                {results.isFetching && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>
                )}
                {!results.isFetching && (results.data?.items.length ?? 0) === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Ningún cliente coincide con “{debounced}”.
                  </p>
                )}
                {results.data?.items.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => goTo(`/clients/${client.id}`)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-accent"
                  >
                    <span className="text-sm font-medium">{client.name}</span>
                    <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
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

          {canSeeNotes && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative shrink-0 text-muted-foreground"
                  aria-label={
                    dueCount > 0
                      ? `${dueCount} ${dueCount === 1 ? "recordatorio vencido" : "recordatorios vencidos"}`
                      : "Sin recordatorios vencidos"
                  }
                >
                  <Bell className="h-5 w-5" />
                  {dueCount > 0 && (
                    <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[320px] p-1">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">Recordatorios vencidos</p>
                  <p className="text-xs text-muted-foreground">
                    La app no manda nada por su cuenta: te los muestra acá.
                  </p>
                </div>
                {dueCount === 0 ? (
                  <p className="px-3 pb-3 text-sm text-muted-foreground">
                    No hay ninguno vencido.
                  </p>
                ) : (
                  <>
                    {reminders.data?.slice(0, 5).map((note) => (
                      <div key={note.id} className="rounded-md px-3 py-2 hover:bg-accent">
                        <p className="line-clamp-2 text-sm">{note.content}</p>
                        {note.reminderAt && (
                          <p className="text-xs text-muted-foreground">
                            Venció el {formatDate(note.reminderAt)}
                          </p>
                        )}
                      </div>
                    ))}
                    <Link
                      href="/notes"
                      className="block rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
                    >
                      Ver todas las notas
                    </Link>
                  </>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </header>
  )
}
