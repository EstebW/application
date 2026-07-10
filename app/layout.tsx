import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mon Jumeau Célèbre — Découvre ta célébrité jumelle',
  description: 'Upload ton selfie, l\'IA analyse ton visage et révèle à quelle star tu ressembles vraiment.',
  openGraph: {
    title: 'Mon Jumeau Célèbre',
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
