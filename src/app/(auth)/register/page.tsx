"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
  const [isLoading, setIsLoading] = React.useState(false)

  async function onSubmit(event: React.SyntheticEvent) {
    event.preventDefault()
    setIsLoading(true)
    
    // Simulate register
    setTimeout(() => {
      setIsLoading(false)
    }, 1000)
  }

  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create an account
        </h1>
        <p className="text-sm text-muted-foreground">
          Register your service business on ServiFlow
        </p>
      </div>
      <div className="grid gap-6">
        <form onSubmit={onSubmit}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                placeholder="Acme Services"
                type="text"
                disabled={isLoading}
              />
            </div>
             <div className="grid gap-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                type="text"
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="name@example.com"
                type="email"
                autoCapitalize="none"
                autoComplete="email"
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
               <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                disabled={isLoading}
              />
            </div>
            <Button disabled={isLoading} className="mt-2 w-full">
              {isLoading && (
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
              )}
              Create Account
            </Button>
          </div>
        </form>
      </div>
      <p className="px-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="hover:text-primary underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </>
  )
}
