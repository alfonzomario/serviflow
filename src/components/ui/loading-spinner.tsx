"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  label?: string
  size?: "sm" | "md" | "lg"
  fullPage?: boolean
  className?: string
}

export function LoadingSpinner({
  label = "Cargando...",
  size = "md",
  fullPage = false,
  className,
}: LoadingSpinnerProps) {
  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-7 w-7",
    lg: "h-10 w-10",
  }

  const content = (
    <div className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center animate-in fade-in duration-300", className)}>
      <div className="relative flex items-center justify-center">
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 blur-md opacity-40 animate-pulse" />
        
        <div className="relative flex items-center justify-center rounded-2xl bg-card border border-border/50 p-3.5 shadow-xl">
          <Loader2 className={cn("animate-spin text-indigo-500", iconSizes[size])} />
          {size === "lg" && (
            <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-amber-400 animate-bounce" />
          )}
        </div>
      </div>

      {label && (
        <p className="text-xs font-semibold tracking-wide text-muted-foreground animate-pulse">
          {label}
        </p>
      )}
    </div>
  )

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        {content}
      </div>
    )
  }

  return content
}
