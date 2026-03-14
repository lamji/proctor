import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { PwaRegistration } from "@/components/pwa-registration";
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: 'Exam Proctor Capture',
  description: 'Capture and review proctoring screenshots with AI analysis.',
  applicationName: 'Exam Proctor Capture',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon.ico',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Exam Proctor',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", fontSans.variable)}
    >
      <body>
        <PwaRegistration />
        <ThemeProvider>
            {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
