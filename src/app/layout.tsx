import type { Metadata } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "sonner"
import { TRPCProvider } from "@/lib/trpc"
import "./globals.css"

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
})

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
    <html lang={locale} className="dark">
      <body className={`${font.variable} font-sans antialiased`}>
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
