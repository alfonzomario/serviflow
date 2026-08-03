import React from "react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[hsl(var(--background))]">
      {/* Left side — decorative dark panel */}
      <div
        className="hidden lg:flex flex-col justify-between p-10 text-white relative overflow-hidden"
        style={{ background: "hsl(var(--sidebar-bg))" }}
      >
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 via-blue-900/30 to-[hsl(var(--background))] z-0" />
        {/* Decorative orb */}
        <div
          className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full pointer-events-none"
          style={{
            background: "hsl(239 84% 67% / 0.18)",
            filter: "blur(80px)",
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center
              bg-gradient-to-br from-blue-500 to-indigo-600
              shadow-lg shadow-indigo-500/30
              ring-1 ring-white/10"
          >
            <span className="font-black text-lg text-white">S</span>
          </div>
          <span className="text-xl font-extrabold tracking-tight">ServiFlow</span>
        </div>

        {/* Testimonial */}
        <div className="relative z-10 max-w-md">
          <blockquote className="space-y-3">
            <p className="text-base font-medium leading-relaxed text-white/80">
              &ldquo;ServiFlow has transformed how we manage our field operations. Everything from scheduling to billing is now seamless and automated.&rdquo;
            </p>
            <footer className="text-sm text-white/50 font-medium">
              Sofia Ramirez, Operations Manager
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right side — Form container */}
      <div className="flex items-center justify-center p-8 bg-[hsl(var(--background))] relative">
        {/* Subtle background orb */}
        <div
          className="absolute top-0 right-0 h-64 w-64 rounded-full pointer-events-none opacity-30"
          style={{
            background: "hsl(239 84% 67% / 0.08)",
            filter: "blur(60px)",
          }}
        />
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px] relative z-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/30">
                S
              </div>
              <span className="font-extrabold text-xl tracking-tight">ServiFlow</span>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
