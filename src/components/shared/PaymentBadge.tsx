import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  WAIVED = "WAIVED",
}

interface PaymentBadgeProps {
  status: PaymentStatus
}

export function PaymentBadge({ status }: PaymentBadgeProps) {
  const config = {
    [PaymentStatus.PENDING]: { color: "bg-red-500/10 text-red-500 hover:bg-red-500/20", label: "pending" },
    [PaymentStatus.PAID]: { color: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20", label: "paid" },
    [PaymentStatus.WAIVED]: { color: "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20", label: "waived" },
  }

  const { color, label } = config[status]

  return (
    <Badge variant="outline" className={cn("border-none", color)}>
      <span className="capitalize">{label}</span>
    </Badge>
  )
}
