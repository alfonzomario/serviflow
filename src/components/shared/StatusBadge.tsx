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
    [VisitStatus.PENDING_CONFIRM]: {
      color: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
      label: "Sin confirmar",
      dotAnimated: true,
    },
    [VisitStatus.CONFIRMED]: {
      color: "bg-blue-500/15 text-blue-300 border border-blue-500/20",
      label: "Confirmada",
      dotAnimated: false,
    },
    [VisitStatus.COMPLETED]: {
      color: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
      label: "Realizada",
      dotAnimated: false,
    },
    [VisitStatus.CANCELLED]: {
      color: "bg-red-500/15 text-red-300 border border-red-500/20 opacity-70",
      label: "Cancelada",
      dotAnimated: false,
    },
    [VisitStatus.SKIPPED]: {
      color: "bg-slate-500/15 text-slate-400 border border-slate-500/15 opacity-60",
      label: "Omitida",
      dotAnimated: false,
    },
  }

  const { color, label, dotAnimated } = config[status]

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-none gap-1.5 font-semibold rounded-full",
        color,
        size === "sm" ? "px-2 py-0 text-[10px]" : "px-2.5 py-0.5 text-xs"
      )}
    >
      <span
        className={cn(
          "rounded-full bg-current shrink-0",
          dotAnimated && "animate-pulse",
          size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2"
        )}
      />
      <span>{label}</span>
    </Badge>
  )
}
