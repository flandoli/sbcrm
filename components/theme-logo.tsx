export function ThemeLogo({ className }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight text-foreground ${className ?? ''}`}>
      Funil Comercial
    </span>
  )
}
