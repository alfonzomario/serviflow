"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { trpc } from "@/lib/trpc"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // A business that has not been through the wizard yet gets sent there once.
  const tenant = trpc.tenant.current.useQuery()
  const needsOnboarding = tenant.data ? !tenant.data.settings?.onboardedAt : false

  useEffect(() => {
    if (needsOnboarding && pathname !== "/onboarding") router.replace("/onboarding")
  }, [needsOnboarding, pathname, router])

  // The wizard fills the screen: no sidebar, nothing to navigate away to yet.
  if (pathname === "/onboarding") {
    return (
      <div className="min-h-screen overflow-y-auto bg-[hsl(var(--background))] p-4 lg:p-8">{children}</div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-[hsl(var(--background))] p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
