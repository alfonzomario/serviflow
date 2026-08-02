"use client"

import * as React from "react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface RequestFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RequestForm({ open, onOpenChange }: RequestFormProps) {
  const utils = trpc.useUtils()
  const clients = trpc.clients.options.useQuery(undefined, { enabled: open })
  const serviceTypes = trpc.tenant.serviceTypes.useQuery(undefined, { enabled: open })

  const [clientId, setClientId] = React.useState("")
  const [urgency, setUrgency] = React.useState("MEDIUM")
  const [services, setServices] = React.useState("")
  const [comment, setComment] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setClientId("")
    setUrgency("MEDIUM")
    setServices("")
    setComment("")
    setError(null)
  }, [open])

  const createRequest = trpc.requests.create.useMutation({
    onSuccess: async () => {
      toast.success("Solicitud creada")
      await utils.requests.invalidate()
      onOpenChange(false)
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!clientId) {
      setError("Elegí un cliente")
      return
    }

    createRequest.mutate({
      clientId,
      urgency: urgency as "MEDIUM",
      serviceTypes: services
        .split(",")
        .map((service) => service.trim())
        .filter(Boolean),
      comment: comment.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva solicitud</DialogTitle>
          <DialogDescription>
            Registrá un pedido de servicio para agendarlo más adelante.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="client">Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="client">
                <SelectValue placeholder="Elegí un cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.data?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="urgency">Urgencia</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger id="urgency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Baja</SelectItem>
                <SelectItem value="MEDIUM">Media</SelectItem>
                <SelectItem value="HIGH">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="services">Servicios pedidos</Label>
            <Input
              id="services"
              list="request-service-types"
              value={services}
              onChange={(event) => setServices(event.target.value)}
              placeholder="Cucarachas, Desratización"
            />
            <datalist id="request-service-types">
              {serviceTypes.data?.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">Separá con comas</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="comment">Comentario</Label>
            <Textarea
              id="comment"
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Qué necesita el cliente, cuándo le queda cómodo…"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createRequest.isPending}>
              {createRequest.isPending ? "Guardando…" : "Crear solicitud"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
