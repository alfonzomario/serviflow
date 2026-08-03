import { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-in fade-in zoom-in duration-300">
      {/* Icon with elevated container + halo */}
      <div className="relative mb-6">
        <div
          className="h-16 w-16 rounded-2xl flex items-center justify-center
            bg-[hsl(var(--secondary))] border border-[hsl(var(--border))]
            shadow-xl"
        >
          <Icon className="h-7 w-7 text-[hsl(var(--muted-foreground)/0.8)]" />
        </div>
        {/* Decorative halo */}
        <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--primary)/0.06)] blur-xl pointer-events-none" />
      </div>

      <h3 className="text-base font-bold mb-2 text-[hsl(var(--foreground))]">
        {title}
      </h3>
      <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-xs leading-relaxed mb-6">
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="rounded-xl bg-[hsl(var(--primary))] text-white px-5 py-2.5
            text-sm font-semibold transition-all duration-200
            hover:bg-[hsl(var(--primary)/0.85)]
            hover:shadow-lg hover:shadow-[hsl(var(--primary)/0.25)]
            active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
