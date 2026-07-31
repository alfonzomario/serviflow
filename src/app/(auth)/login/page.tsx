"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn } from "next-auth/react"

export default function LoginPage() {
  const [isLoading, setIsLoading] = React.useState(false)

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault()
    setIsLoading(true)
    
    // Simulate sign in
    setTimeout(() => {
      setIsLoading(false)
    }, 1000)
  }

  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your email to sign in to your account
        </p>
      </div>
      <div className="grid gap-6">
        <form onSubmit={onSubmit}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="name@example.com"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect="off"
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                disabled={isLoading}
              />
            </div>
            <Button disabled={isLoading} className="mt-2">
              {isLoading && (
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
              )}
              Sign In
            </Button>
          </div>
        </form>
      </div>
      <p className="px-8 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="hover:text-primary underline underline-offset-4"
        >
          Register your business
        </Link>
      </p>
    </>
  )
}
