"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search, UserPlus, MapPin, X } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ClientOption {
  id: string
  name: string
  address?: string | null
  phone?: string | null
}

interface ClientComboboxProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  onAddNewClient?: () => void
}

export function ClientCombobox({
  value,
  onChange,
  placeholder = "Buscar o seleccionar cliente...",
  disabled = false,
  className = "",
  onAddNewClient,
}: ClientComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Cache options for 5 minutes for instant responsiveness
  const { data: clients = [], isLoading } = trpc.clients.options.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })

  // Focus search input when popover opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setSearch("")
    }
  }, [open])

  const selectedClient = React.useMemo(() => {
    return clients.find((c) => c.id === value)
  }, [clients, value])

  const filteredClients = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q)
      const addressMatch = c.address ? c.address.toLowerCase().includes(q) : false
      return nameMatch || addressMatch
    })
  }, [clients, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`w-full justify-between font-normal text-left h-11 px-3.5 bg-background border-input hover:bg-accent/50 ${
            !selectedClient ? "text-muted-foreground" : "text-foreground font-semibold"
          } ${className}`}
        >
          <span className="truncate flex items-center gap-2">
            {selectedClient ? (
              <>
                <span className="truncate">{selectedClient.name}</span>
                {selectedClient.address && (
                  <span className="text-xs text-muted-foreground font-normal truncate hidden sm:inline">
                    • {selectedClient.address}
                  </span>
                )}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 bg-card border-border shadow-2xl rounded-xl z-50 overflow-hidden" align="start">
        {/* Search Input Box */}
        <div className="flex items-center border-b border-border px-3 py-2 bg-muted/30">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Escribí el nombre completo o dirección..."
            className="flex h-9 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground border-0 focus:ring-0"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Client Options List */}
        <div className="max-h-64 overflow-y-auto p-1 divide-y divide-border/20">
          {isLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
              Cargando clientes...
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground px-4">
              No se encontraron clientes para &quot;<span className="font-semibold">{search}</span>&quot;
            </div>
          ) : (
            filteredClients.map((client) => {
              const isSelected = client.id === value
              return (
                <div
                  key={client.id}
                  onClick={() => {
                    onChange(client.id)
                    setOpen(false)
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-accent/80 text-foreground"
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="truncate font-medium">{client.name}</span>
                    {client.address && (
                      <span className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {client.address}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </div>
              )
            })
          )}
        </div>

        {/* Optional Add New Client Action Footer */}
        {onAddNewClient && (
          <div className="p-1 border-t border-border bg-muted/40">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs font-semibold text-primary hover:text-primary hover:bg-primary/10 gap-2 h-9 rounded-lg"
              onClick={() => {
                setOpen(false)
                onAddNewClient()
              }}
            >
              <UserPlus className="h-4 w-4" />
              + Crear nuevo cliente
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
