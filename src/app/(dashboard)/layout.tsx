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
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [impersonating, setImpersonating] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (document.cookie.includes('serviflow_impersonate=')) {
      setImpersonating(true)
    }
    const saved = localStorage.getItem('serviflow_sidebar_collapsed')
    if (saved !== null) {
      setIsCollapsed(saved === 'true')
    }
  }, [])

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('serviflow_sidebar_collapsed', String(next))
      return next
    })
  }

  const clearImpersonation = () => {
    document.cookie = 'serviflow_impersonate=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
    window.location.href = '/superadmin'
  }

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
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden transition-all duration-300">
        {impersonating && (
          <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm font-medium flex items-center justify-between z-50 relative">
            <span>Estás viendo la plataforma como <strong>{tenant.data?.name || 'otra organización'}</strong>.</span>
            <button onClick={clearImpersonation} className="underline hover:no-underline font-bold">
              Volver a SuperAdmin
            </button>
          </div>
        )}
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
