import React from "react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left side - Dynamic decorative background */}
      <div className="hidden lg:flex flex-col justify-between bg-zinc-900 p-10 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-purple-900/40 to-black z-0" />
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
            <span className="font-bold text-xl">S</span>
          </div>
          <span className="text-2xl font-bold tracking-tight">ServiFlow</span>
        </div>

        <div className="relative z-10 max-w-md">
          <blockquote className="space-y-2">
            <p className="text-lg font-medium leading-relaxed">
              &ldquo;ServiFlow has transformed how we manage our field operations. Everything from scheduling to billing is now seamless and automated.&rdquo;
            </p>
            <footer className="text-sm text-zinc-400">
              Sofia Ramirez, Operations Manager
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right side - Form container */}
      <div className="flex items-center justify-center p-8 bg-background relative">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="lg:hidden flex justify-center mb-4">
             <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold">
                  S
                </div>
                <span className="font-bold text-xl">ServiFlow</span>
             </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
