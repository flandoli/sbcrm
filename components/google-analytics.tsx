'use client'

import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

// Só ativa quando um Measurement ID real (G-XXXX) estiver configurado.
function isValidGaId(id?: string): id is string {
  return !!id && /^G-[A-Z0-9]+$/i.test(id) && id !== 'G-XXXXXXXXXX'
}

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
    dataLayer?: any[]
  }
}

function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!isValidGaId(GA_ID) || typeof window.gtag !== 'function') return
    const query = searchParams?.toString()
    const url = query ? `${pathname}?${query}` : pathname
    window.gtag('config', GA_ID, { page_path: url })
  }, [pathname, searchParams])

  return null
}

export function GoogleAnalytics() {
  if (!isValidGaId(GA_ID)) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  )
}
