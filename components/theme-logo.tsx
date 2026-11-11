'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'

export function ThemeLogo({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const src = mounted && resolvedTheme === 'light' ? '/logo-lq-light.png' : '/logo-lq.png'

  return <img src={src} alt="Lead Qualifier" className={className} />
}
