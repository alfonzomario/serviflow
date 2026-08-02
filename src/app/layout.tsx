import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "sonner"
import { TRPCProvider } from "@/lib/trpc"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ServiFlow",
  description: "Plataforma de gestión para negocios de servicios a domicilio",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <SessionProvider>
          <TRPCProvider>
            <NextIntlClientProvider locale={locale} messages={messages}>
              {children}
              <Toaster richColors position="top-right" />
            </NextIntlClientProvider>
          </TRPCProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
