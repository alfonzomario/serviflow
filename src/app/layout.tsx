import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
// Placeholders for providers since we don't have them defined yet
// import { NextIntlClientProvider } from 'next-intl'
// import { TRPCProvider } from '@/lib/trpc/Provider'
// import { SessionProvider } from 'next-auth/react'

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ServiFlow",
  description: "Plataforma de gestión para negocios de servicios a domicilio",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* <SessionProvider> */}
          {/* <TRPCProvider> */}
            {/* <NextIntlClientProvider messages={messages} locale={locale}> */}
              {children}
            {/* </NextIntlClientProvider> */}
          {/* </TRPCProvider> */}
        {/* </SessionProvider> */}
      </body>
    </html>
  )
}
