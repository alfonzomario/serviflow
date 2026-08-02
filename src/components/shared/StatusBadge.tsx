import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export enum VisitStatus {
  PENDING_CONFIRM = "PENDING_CONFIRM",
  CONFIRMED = "CONFIRMED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  SKIPPED = "SKIPPED",
}

interface StatusBadgeProps {
  status: VisitStatus
  size?: "sm" | "md"
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = {
    [VisitStatus.PENDING_CONFIRM]: { color: "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20", label: "Sin confirmar" },
    [VisitStatus.CONFIRMED]: { color: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20", label: "Confirmada" },
    [VisitStatus.COMPLETED]: { color: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20", label: "Completada" },
    [VisitStatus.CANCELLED]: { color: "bg-red-500/10 text-red-500 hover:bg-red-500/20", label: "Cancelada" },
    [VisitStatus.SKIPPED]: { color: "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20", label: "Omitida" },
  }

  const { color, label } = config[status]

  return (
    <Badge variant="outline" className={cn("border-none gap-1.5", color, size === "sm" ? "px-2 py-0" : "")}>
      <span className={cn("rounded-full bg-current", size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2")} />
      <span>{label}</span>
    </Badge>
  )
}
