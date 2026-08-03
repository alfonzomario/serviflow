"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
  isPending?: boolean
  onConfirm: () => void
}

/**
 * Replaces `window.confirm` for destructive actions so the prompt is styled,
 * dismissible and can show a pending state while the mutation runs.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-2xl border border-[hsl(var(--border))]
          bg-[hsl(var(--card))] shadow-2xl shadow-black/50"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className={
              variant === "destructive"
                ? "rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white hover:shadow-lg hover:shadow-red-500/30 border-none"
                : "rounded-xl"
            }
          >
            {isPending ? "Procesando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
