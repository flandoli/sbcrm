import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AuthLayout({
  title,
  titleImage,
  description,
  children,
  className,
}: {
  title: string
  titleImage?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 hero-gradient">
      <Card className={cn('w-full max-w-md shadow-lg', className)}>
        <CardHeader className="text-center">
          {titleImage ? (
            <div className="flex justify-center">
              <img src={titleImage} alt={title} className="h-12 w-auto" />
            </div>
          ) : (
            <CardTitle className="font-display text-2xl tracking-tight">{title}</CardTitle>
          )}
          {description && (
            <CardDescription className="text-sm text-muted-foreground mt-2">{description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}
