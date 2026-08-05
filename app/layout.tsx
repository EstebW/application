import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StarFusion — Découvre ta célébrité jumelle',
  description: 'Upload ton selfie, l\'IA analyse ton visage et révèle à quelle star tu ressembles vraiment.',
  icons: {
    icon: [
      { url: '/favicon-32x32.png?v=3', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png?v=3', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.png?v=3', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.ico?v=3', sizes: 'any' },
    ],
    apple: [{ url: '/apple-touch-icon.png?v=3', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon-32x32.png?v=3',
  },
  openGraph: {
    title: 'StarFusion',
    description: 'Découvre à quelle célébrité tu ressembles vraiment',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0A0A0A] text-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
