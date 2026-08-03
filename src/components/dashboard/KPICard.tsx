"use client"

import { Card, CardContent } from "@/components/ui/card"
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface KPICardProps {
  title: string
  value: string
  icon: LucideIcon
  trend?: {
    value: string
    direction: "up" | "down" | "neutral"
  }
  variant?: "default" | "primary" | "success" | "warning"
}

export function KPICard({ title, value, icon: Icon, trend, variant = "default" }: KPICardProps) {
  const variantStyles: Record<string, string> = {
    default: "bg-[hsl(var(--card))] border-[hsl(var(--border))]",
    primary: "bg-gradient-to-br from-indigo-500/15 to-blue-500/5 border-indigo-500/20",
    success: "bg-gradient-to-br from-emerald-500/15 to-teal-500/5 border-emerald-500/20",
    warning: "bg-gradient-to-br from-amber-500/15 to-orange-500/5 border-amber-500/20",
  }

  const iconStyles: Record<string, string> = {
    default: "text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] shadow-none",
    primary: "text-indigo-400 bg-indigo-500/15 shadow-lg shadow-indigo-500/20",
    success: "text-emerald-400 bg-emerald-500/15 shadow-lg shadow-emerald-500/20",
    warning: "text-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/20",
  }

  const hoverShadows: Record<string, string> = {
    default: "hover:shadow-[0_8px_30px_hsl(var(--primary)/0.08)]",
    primary: "hover:shadow-[0_8px_30px_hsl(239_84%_67%/0.15)]",
    success: "hover:shadow-[0_8px_30px_hsl(160_84%_39%/0.15)]",
    warning: "hover:shadow-[0_8px_30px_hsl(38_92%_50%/0.15)]",
  }

  const TrendIcon =
    trend?.direction === "up" ? TrendingUp :
    trend?.direction === "down" ? TrendingDown : Minus

  const trendColor =
    trend?.direction === "up" ? "text-emerald-400" :
    trend?.direction === "down" ? "text-red-400" : "text-[hsl(var(--muted-foreground))]"

  return (
    <Card
      className={cn(
        "overflow-hidden border transition-all duration-300",
        "hover:scale-[1.02] hover:-translate-y-0.5",
        variantStyles[variant],
        hoverShadows[variant]
      )}
    >
      <CardContent className="p-5">
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground)/0.8)]">
              {title}
            </p>
            <p className="text-3xl font-extrabold tracking-tight tabular-nums text-[hsl(var(--foreground))]">
              {value}
            </p>
          </div>
          <div className={cn("p-3 rounded-xl shrink-0", iconStyles[variant])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>

        {trend && (
          <div className="mt-4 flex items-center gap-1.5 text-xs">
            <span className={cn("font-semibold flex items-center gap-0.5", trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {trend.value}
            </span>
            <span className="text-[hsl(var(--muted-foreground)/0.6)]">vs. mes anterior</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
