# sbcrm — Funil Comercial (v1)

Next.js 14 + TypeScript + Tailwind + Prisma/PostgreSQL. Gerenciador de pacotes: **yarn**.

## O que está no Marco 0
- Login por e-mail/senha (NextAuth Credentials, sessão JWT) com papéis `ADMIN`, `DIRETOR`, `GERENTE`, `VENDEDOR`.
- Ingestão de leads (`POST /api/webhook/leadster`) com dedupe por telefone normalizado e classificação de canal (UTM, ad-id, gclid/fbclid).
- Qualificação "pré" por DDD/DDI (`Setting.allowed_ddds`) e "posterior" via Meta CAPI — **desligada** (`capi_enabled=false`).
- Casamento venda↔lead (CNPJ → telefone → razão social) e atribuição pela data da venda (`lib/sale-matching.ts`, `lib/sales-utils.ts`).
- `AuditLog`: toda alteração de configuração e cada ingestão de webhook ficam registradas.
- Schema Prisma completo da v1 (21 entidades novas + enums). Chaves de IA ficam criptografadas (AES-256-GCM, `lib/crypto.ts`, `ENCRYPTION_KEY`).
- Fora da v1: motor de precificação, integrações com CRM externo e plataformas de anúncios, automações e voz.

## Decisões de modelagem
- O model OAuth do NextAuth virou `AuthAccount` (`auth_accounts`) para liberar `Account` para a empresa/CNPJ.
- `Account @@unique([cnpjRaiz, cnpjEstabelecimento])` para dedupe por CNPJ.
- `Sale.leadId` / `phoneNormalized` mantêm o casamento venda↔lead por telefone; `Sale.importHash` deixa a importação idempotente.
- `Proposal.pacote` é só um rótulo (não existe motor de preços na v1).

## Como rodar
```bash
cp .env.example .env        # preencha DATABASE_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY, SEED_ADMIN_*
yarn install
yarn prisma migrate deploy  # ou: yarn prisma:migrate (desenvolvimento)
yarn seed                   # cria o Admin a partir de SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
yarn dev
```

Gerar `ENCRYPTION_KEY`: `openssl rand -base64 32`.

Verificações: `yarn typecheck` e `yarn build`.
