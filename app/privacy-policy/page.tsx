import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

const APP_NAME = 'Lead Qualifier'
const CONTACT_EMAIL = 'contato@leadqualifier.com'
const LAST_UPDATED = '27 de agosto de 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold tracking-tight mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-lq.png" alt={APP_NAME} className="h-8 w-auto" />
            <span className="font-display text-lg font-semibold tracking-tight">{APP_NAME}</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Início
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold tracking-tight">Política de Privacidade</h1>
        <p className="mt-3 text-sm text-muted-foreground">Última atualização: {LAST_UPDATED}</p>

        <Section title="1. Quem somos">
          <p>
            O {APP_NAME} é uma plataforma de qualificação de leads e mensuração de campanhas de
            marketing digital. Esta Política de Privacidade descreve como coletamos, usamos,
            armazenamos e protegemos os dados tratados pela aplicação.
          </p>
        </Section>

        <Section title="2. Dados que coletamos">
          <p>Para operar a plataforma, podemos tratar as seguintes categorias de dados:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Dados de contato de leads:</strong> nome, número de telefone (WhatsApp),
              origem da campanha e status de qualificação.
            </li>
            <li>
              <strong>Dados de vendas/matrículas:</strong> informações importadas manualmente pelo
              usuário, como nome, e-mail, telefone, curso, valor pago e forma de pagamento.
            </li>
            <li>
              <strong>Dados de conta do usuário da plataforma:</strong> nome e e-mail utilizados
              para autenticação, inclusive quando o login é feito com a Conta Google.
            </li>
            <li>
              <strong>Dados de campanhas de anúncios:</strong> métricas de desempenho e investimento
              obtidas por meio das APIs da Meta e do Google Ads, quando conectadas.
            </li>
          </ul>
        </Section>

        <Section title="3. Como usamos os dados">
          <ul className="list-disc pl-5 space-y-1">
            <li>Organizar e qualificar os leads recebidos das campanhas.</li>
            <li>Enviar eventos de conversão para a Meta Conversions API a fim de otimizar campanhas.</li>
            <li>Cruzar vendas com leads para calcular receita, ROAS e custo por aquisição.</li>
            <li>Autenticar e dar acesso seguro ao painel da aplicação.</li>
            <li>Exibir métricas de investimento e retorno das campanhas de mídia.</li>
          </ul>
        </Section>

        <Section title="4. Uso de dados de APIs do Google (Limited Use)">
          <p>
            O uso e a transferência, pelo {APP_NAME}, de informações recebidas das APIs do Google
            obedecem à{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , incluindo os requisitos de Uso Limitado (Limited Use).
          </p>
          <p>
            Os dados obtidos do Google são utilizados exclusivamente para fornecer e melhorar as
            funcionalidades visíveis ao usuário dentro da aplicação. Não vendemos esses dados, não os
            usamos para publicidade e não os compartilhamos com terceiros, exceto quando necessário
            para operar o serviço, cumprir a lei ou mediante consentimento do usuário.
          </p>
        </Section>

        <Section title="5. Compartilhamento de dados">
          <p>
            Não vendemos dados pessoais. Podemos compartilhar dados apenas com provedores que dão
            suporte à operação da plataforma (por exemplo, hospedagem e as APIs de anúncios da Meta e
            do Google), sempre limitado ao necessário para prestação do serviço, ou quando exigido por
            lei.
          </p>
        </Section>

        <Section title="6. Armazenamento e segurança">
          <p>
            Os dados são armazenados em ambiente seguro, com controle de acesso por autenticação.
            Adotamos medidas técnicas e organizacionais razoáveis para proteger as informações contra
            acesso não autorizado, perda ou alteração.
          </p>
        </Section>

        <Section title="7. Retenção">
          <p>
            Mantemos os dados pelo tempo necessário para cumprir as finalidades descritas nesta
            Política ou conforme exigido por obrigações legais. Você pode solicitar a exclusão dos
            seus dados a qualquer momento.
          </p>
        </Section>

        <Section title="8. Seus direitos (LGPD)">
          <p>
            Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar
            acesso, correção, portabilidade, anonimização ou exclusão dos seus dados, bem como revogar
            consentimentos. Para exercer esses direitos, entre em contato conosco.
          </p>
        </Section>

        <Section title="9. Contato">
          <p>
            Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento dos seus
            dados, entre em contato pelo e-mail{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}
        </div>
      </footer>
    </div>
  )
}
