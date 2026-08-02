"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = React.useState(false)

  const register = trpc.auth.register.useMutation({
    onError: (mutationError) => setError(mutationError.message),
  })

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "")
    const password = String(formData.get("password") ?? "")

    try {
      await register.mutateAsync({
        companyName: String(formData.get("businessName") ?? ""),
        name: String(formData.get("name") ?? ""),
        email,
        password,
      })
    } catch {
      return // onError already surfaced the message
    }

    // Log the new owner straight in rather than bouncing them to /login.
    setIsSigningIn(true)
    const result = await signIn("credentials", { email, password, redirect: false })
    if (result?.error) {
      router.replace("/login")
      return
    }
    router.replace("/")
    router.refresh()
  }

  const isLoading = register.isPending || isSigningIn

  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Creá tu cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Registrá tu negocio de servicios en ServiFlow
        </p>
      </div>
      <div className="grid gap-6">
        <form onSubmit={onSubmit}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="businessName">Nombre del negocio</Label>
              <Input
                id="businessName"
                name="businessName"
                placeholder="Fumigaciones Acme"
                type="text"
                required
                minLength={2}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Tu nombre</Label>
              <Input
                id="name"
                name="name"
                placeholder="Juan Pérez"
                type="text"
                required
                minLength={2}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                placeholder="nombre@ejemplo.com"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                required
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres</p>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button disabled={isLoading} className="mt-2 w-full">
              {isLoading && (
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
              )}
              Crear cuenta
            </Button>
          </div>
        </form>
      </div>
      <p className="px-8 text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="hover:text-primary underline underline-offset-4">
          Ingresar
        </Link>
      </p>
    </>
  )
}
