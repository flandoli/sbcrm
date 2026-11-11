import Link from 'next/link'
import {
  MessageCircle,
  Target,
  TrendingUp,
  ShieldCheck,
  BarChart3,
  Users,
  ArrowRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const APP_NAME = 'Lead Qualifier'

const features = [
  {
    icon: MessageCircle,
    title: 'Captura de leads de WhatsApp',
    desc: 'Recebe automaticamente os contatos gerados por campanhas Click-to-WhatsApp e organiza tudo em um só lugar.',
  },
  {
    icon: Target,
    title: 'Qualificação de leads',
    desc: 'Classifique cada contato por DDI/DDD e status, separando oportunidades reais de números indesejados.',
  },
  {
    icon: TrendingUp,
    title: 'Eventos de conversão',
    desc: 'Envia eventos de qualificação para a Meta Conversions API, melhorando a otimização das suas campanhas.',
  },
  {
    icon: BarChart3,
    title: 'Vendas e matrículas',
    desc: 'Importe suas vendas e cruze com os leads capturados para medir receita, ROAS e custo por matrícula.',
  },
  {
    icon: Users,
    title: 'Integração com anúncios',
    desc: 'Consolida o investimento em mídia (Meta Ads e Google Ads) para comparar gasto e retorno por período.',
  },
  {
    icon: ShieldCheck,
    title: 'Dados protegidos',
    desc: 'Tratamento de dados em conformidade com a LGPD e com as políticas de dados do usuário do Google.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo-lq.png" alt={APP_NAME} className="h-8 w-auto" />
            <span className="font-display text-lg font-semibold tracking-tight">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/privacy-policy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Política de Privacidade
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Acessar aplicativo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Qualificação de leads e mensuração de campanhas
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
          {APP_NAME}
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Plataforma para capturar leads de WhatsApp gerados por campanhas, qualificá-los,
          enviar eventos de conversão para a Meta e cruzar as vendas com o investimento em
          mídia para medir o retorno real das suas campanhas.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Acessar aplicativo <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/privacy-policy"
            className="inline-flex items-center rounded-lg border border-border px-6 py-3 text-sm font-medium hover:bg-accent transition-colors"
          >
            Política de Privacidade
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="rounded-xl border border-border/60 bg-card p-6 shadow-sm"
              >
                <div className="inline-flex p-2.5 rounded-lg bg-primary/10 mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display text-base font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <img src="/logo-lq.png" alt={APP_NAME} className="h-6 w-auto" />
            <span>© {new Date().getFullYear()} {APP_NAME}</span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors">
              Política de Privacidade
            </Link>
            <Link href="/app" className="text-muted-foreground hover:text-foreground transition-colors">
              Acessar aplicativo
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
