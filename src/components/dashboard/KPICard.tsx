"use client"

import { Card, CardContent } from "@/components/ui/card"
import { LucideIcon } from "lucide-react"
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
  const variantStyles = {
    default: "bg-card text-card-foreground border-border",
    primary: "bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20",
    success: "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20",
    warning: "bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20",
  }

  const iconStyles = {
    default: "text-muted-foreground bg-muted",
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    warning: "text-amber-500 bg-amber-500/10",
  }

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300 hover:shadow-md hover:scale-[1.02]",
      variantStyles[variant]
    )}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={cn("p-3 rounded-full", iconStyles[variant])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        
        {trend && (
          <div className="mt-4 flex items-center text-sm">
            <span className={cn(
              "font-medium mr-2 flex items-center",
              trend.direction === "up" ? "text-emerald-500" : 
              trend.direction === "down" ? "text-red-500" : "text-muted-foreground"
            )}>
              {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}
              {trend.value}
            </span>
            <span className="text-muted-foreground">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
