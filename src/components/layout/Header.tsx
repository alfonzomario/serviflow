"use client"

import { Bell, Search, Menu, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-md sm:gap-6 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      <div className="flex flex-1 items-center gap-4 lg:gap-6">
        <div className="hidden lg:flex items-center text-sm font-medium text-muted-foreground">
          {/* Breadcrumbs placeholder */}
          <span>Dashboard</span>
        </div>
        <div className="ml-auto flex w-full max-w-sm items-center space-x-2 sm:w-auto sm:space-x-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search..."
              className="w-full bg-muted/50 pl-9 md:w-[300px]"
            />
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground">
            <Globe className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="relative shrink-0 text-muted-foreground">
            <Bell className="h-5 w-5" />
            <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500" />
          </Button>
        </div>
      </div>
    </header>
  )
}
