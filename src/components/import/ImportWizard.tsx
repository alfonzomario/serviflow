"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react"

import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Mapping = {
  sourceColumn: string
  sourceIndex: number
  targetField: string | null
  confidence: "auto" | "manual" | "none"
}

type Strategy = "SKIP" | "UPDATE" | "CREATE_NEW"

const IGNORE = "__ignore__"

const STRATEGIES: { value: Strategy; label: string; hint: string }[] = [
  {
    value: "SKIP",
    label: "Omitir el duplicado",
    hint: "Si ya existe un cliente con el mismo nombre y dirección, se deja como está.",
  },
  {
    value: "UPDATE",
    label: "Actualizar el existente",
    hint: "Completa los datos que falten. Una celda vacía en la planilla no borra lo que ya había.",
  },
  {
    value: "CREATE_NEW",
    label: "Crear igual",
    hint: "Importa todo sin mirar duplicados. Útil solo si sabés que la base está vacía.",
  },
]

type Step = "upload" | "map" | "preview" | "done"

export function ImportWizard({ onImported }: { onImported?: () => void }) {
  const utils = trpc.useUtils()

  const [step, setStep] = React.useState<Step>("upload")
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [content, setContent] = React.useState("")
  const [mappings, setMappings] = React.useState<Mapping[]>([])
  const [sample, setSample] = React.useState<string[][]>([])
  const [strategy, setStrategy] = React.useState<Strategy>("SKIP")
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fields = trpc.import.fields.useQuery({ entity: "clients" })

  const analyze = trpc.import.analyze.useMutation({
    onSuccess: (data) => {
      setMappings(data.mappings)
      setSample(data.sample)
      setStep("map")
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  const preview = trpc.import.preview.useMutation({
    onSuccess: () => setStep("preview"),
    onError: (mutationError) => setError(mutationError.message),
  })

  const execute = trpc.import.execute.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.clients.invalidate(),
        utils.import.invalidate(),
        utils.dashboard.invalidate(),
      ])
      setStep("done")
      onImported?.()
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function reset() {
    setStep("upload")
    setFileName(null)
    setContent("")
    setMappings([])
    setSample([])
    setStrategy("SKIP")
    setError(null)
    analyze.reset()
    preview.reset()
    execute.reset()
  }

  async function readFile(file: File) {
    setError(null)

    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      setError(
        "Por ahora solo CSV. Desde Excel o Google Sheets: Archivo → Descargar → CSV."
      )
      return
    }

    const text = await file.text()
    setFileName(file.name)
    setContent(text)
    analyze.mutate({ entity: "clients", content: text })
  }

  const setTarget = (index: number, value: string) => {
    setMappings((current) =>
      current.map((mapping, position) =>
        position === index
          ? {
              ...mapping,
              targetField: value === IGNORE ? null : value,
              confidence: "manual" as const,
            }
          : mapping
      )
    )
  }

  // Un campo no puede estar mapeado dos veces: la escritura sería impredecible.
  const usedFields = new Set(
    mappings.map((mapping) => mapping.targetField).filter(Boolean) as string[]
  )

  const requiredMissing = (fields.data ?? [])
    .filter((field) => field.required && !usedFields.has(field.field))
    .map((field) => field.label)

  // ── Paso 1: subir ────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files[0]
            if (file) readFile(file)
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
        >
          {analyze.isPending ? (
            <>
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Leyendo el archivo…</p>
            </>
          ) : (
            <>
              <FileUp className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="mb-1 font-medium">Arrastrá tu archivo CSV acá</p>
              <p className="mb-4 text-sm text-muted-foreground">
                Desde Excel o Google Sheets: Archivo → Descargar → CSV
              </p>
              <label>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) readFile(file)
                  }}
                />
                <Button type="button" asChild>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    Elegir archivo
                  </span>
                </Button>
              </label>
            </>
          )}
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          El archivo se procesa en el momento y no se guarda. Nada se escribe hasta que
          confirmes en el último paso.
        </p>
      </div>
    )
  }

  // ── Paso 2: mapear columnas ──────────────────────────────────────────────
  if (step === "map") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Emparejá las columnas</h2>
            <p className="text-sm text-muted-foreground">
              {fileName} · {analyze.data?.totalRows} filas. Lo que reconocimos ya está
              elegido; revisá que esté bien.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cambiar archivo
          </Button>
        </div>

        {requiredMissing.length > 0 && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Falta indicar qué columna es <strong>{requiredMissing.join(", ")}</strong>. Sin
            eso no se puede importar.
          </p>
        )}

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Columna del archivo</TableHead>
                <TableHead>Campo en ServiFlow</TableHead>
                <TableHead>Ejemplo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((mapping, index) => {
                const example = sample
                  .map((row) => row[mapping.sourceIndex])
                  .find((value) => value && value.trim() !== "")

                return (
                  <TableRow key={`${mapping.sourceColumn}-${mapping.sourceIndex}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {mapping.sourceColumn || (
                          <span className="text-muted-foreground">(sin nombre)</span>
                        )}
                        {mapping.confidence === "auto" && (
                          <Badge
                            variant="outline"
                            className="border-none bg-emerald-500/10 text-emerald-600"
                          >
                            detectada
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mapping.targetField ?? IGNORE}
                        onValueChange={(value) => setTarget(index, value)}
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={IGNORE}>No importar</SelectItem>
                          {fields.data?.map((field) => (
                            <SelectItem
                              key={field.field}
                              value={field.field}
                              // Ya asignado a otra columna.
                              disabled={
                                usedFields.has(field.field) &&
                                mapping.targetField !== field.field
                              }
                            >
                              {field.label}
                              {field.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {example ?? "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            disabled={requiredMissing.length > 0 || preview.isPending}
            onClick={() => {
              setError(null)
              preview.mutate({ entity: "clients", content, mappings })
            }}
          >
            {preview.isPending ? "Revisando…" : "Revisar los datos"}
          </Button>
        </div>
      </div>
    )
  }

  // ── Paso 3: preview y validación ─────────────────────────────────────────
  if (step === "preview" && preview.data) {
    const { counts, issues, totalIssues, preview: rows } = preview.data
    const errors = issues.filter((issue) => issue.type === "error")
    const warnings = issues.filter((issue) => issue.type === "warning")

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Revisá antes de importar</h2>
          <Button variant="ghost" size="sm" onClick={() => setStep("map")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al mapeo
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-2xl font-bold tabular-nums">{counts.valid}</span>
            </div>
            <p className="text-sm text-muted-foreground">se van a importar</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-2xl font-bold tabular-nums">{counts.warnings}</span>
            </div>
            <p className="text-sm text-muted-foreground">con algún aviso</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-2xl font-bold tabular-nums">{counts.errors}</span>
            </div>
            <p className="text-sm text-muted-foreground">se descartan</p>
          </Card>
        </div>

        {counts.warnings > 0 && (
          <p className="text-sm text-muted-foreground">
            Las filas con aviso <strong>sí se importan</strong>, sin el dato que falló. Solo
            se descartan las que no tienen nombre.
          </p>
        )}

        {(errors.length > 0 || warnings.length > 0) && (
          <Card className="max-h-64 overflow-y-auto p-4">
            <div className="space-y-1">
              {[...errors, ...warnings].map((issue, index) => (
                <div key={index} className="flex items-start gap-2 text-xs">
                  {issue.type === "error" ? (
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  )}
                  <span>
                    <span className="text-muted-foreground">Fila {issue.row}</span> ·{" "}
                    {issue.label}: {issue.message}
                    {issue.originalValue && (
                      <span className="text-muted-foreground"> ({issue.originalValue})</span>
                    )}
                  </span>
                </div>
              ))}
              {totalIssues > issues.length && (
                <p className="pt-2 text-xs text-muted-foreground">
                  …y {totalIssues - issues.length} avisos más.
                </p>
              )}
            </div>
          </Card>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            <Label>Primeras filas como van a quedar</Label>
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {(fields.data ?? [])
                      .filter((field) => usedFields.has(field.field))
                      .map((field) => (
                        <TableHead key={field.field}>{field.label}</TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.row}>
                      {(fields.data ?? [])
                        .filter((field) => usedFields.has(field.field))
                        .map((field) => {
                          const value = (row.values as Record<string, unknown>)[field.field]
                          return (
                            <TableCell key={field.field} className="text-sm">
                              {value === undefined || value === null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : Array.isArray(value) ? (
                                value.join(", ")
                              ) : (
                                String(value)
                              )}
                            </TableCell>
                          )
                        })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="strategy">Si un cliente ya existe</Label>
          <Select value={strategy} onValueChange={(value) => setStrategy(value as Strategy)}>
            <SelectTrigger id="strategy" className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {STRATEGIES.find((option) => option.value === strategy)?.hint}
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            disabled={counts.valid === 0 || execute.isPending}
            onClick={() => {
              setError(null)
              execute.mutate({
                entity: "clients",
                content,
                mappings,
                strategy,
                fileName,
              })
            }}
          >
            {execute.isPending
              ? "Importando…"
              : `Importar ${counts.valid} ${counts.valid === 1 ? "cliente" : "clientes"}`}
          </Button>
        </div>
      </div>
    )
  }

  // ── Paso 4: resultado ────────────────────────────────────────────────────
  if (step === "done" && execute.data) {
    const { imported, updated, skipped, failed } = execute.data

    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
        <h2 className="mb-2 text-xl font-semibold">Importación terminada</h2>

        <div className="mx-auto mb-6 flex max-w-md flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <span>
            <strong className="tabular-nums">{imported}</strong> creados
          </span>
          {updated > 0 && (
            <span>
              <strong className="tabular-nums">{updated}</strong> actualizados
            </span>
          )}
          {skipped > 0 && (
            <span className="text-muted-foreground">
              <strong className="tabular-nums">{skipped}</strong> omitidos por duplicados
            </span>
          )}
          {failed > 0 && (
            <span className="text-destructive">
              <strong className="tabular-nums">{failed}</strong> fallaron
            </span>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={reset}>
            Importar otro archivo
          </Button>
          <Button
            onClick={() => {
              toast.success("Los clientes ya están en la lista")
              window.location.href = "/clients"
            }}
          >
            Ver los clientes
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Si algo salió mal, podés deshacer esta importación desde el historial de abajo.
        </p>
      </Card>
    )
  }

  return null
}
