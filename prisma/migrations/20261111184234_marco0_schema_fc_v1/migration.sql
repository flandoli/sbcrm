-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'DIRETOR', 'GERENTE', 'VENDEDOR');

-- CreateEnum
CREATE TYPE "Segmento" AS ENUM ('VAREJO', 'INDUSTRIA');

-- CreateEnum
CREATE TYPE "TipoOrigem" AS ENUM ('MIDIA', 'PARCEIRO', 'INDICACAO', 'PROSPECCAO', 'EVENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "PapelPessoa" AS ENUM ('DECISOR', 'INFLUENCIADOR', 'USUARIO', 'CLIENTE_INTERNO', 'PAGADOR', 'OPOSITOR');

-- CreateEnum
CREATE TYPE "TipoOpor" AS ENUM ('NOVA_VENDA', 'UPGRADE', 'RENOVACAO');

-- CreateEnum
CREATE TYPE "Resultado" AS ENUM ('FECHADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('RASCUNHO', 'ATIVA', 'PRINCIPAL', 'FECHADA', 'PERDIDA', 'REATIVADA');

-- CreateEnum
CREATE TYPE "Periodicidade" AS ENUM ('MENSAL', 'TRIMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "StatusTestDrive" AS ENUM ('AGENDADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoAjuste" AS ENUM ('REAJUSTE', 'REVISAO_ESCOPO', 'VENCIMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoMapItem" AS ENUM ('PROXIMO_PASSO', 'DEPENDENCIA', 'UPGRADE', 'ALERTA');

-- CreateEnum
CREATE TYPE "StatusCasamento" AS ENUM ('CASADO', 'REVISAO', 'NAO_CASADO');

-- CreateEnum
CREATE TYPE "TipoAnalise" AS ENUM ('PROXIMOS_PASSOS', 'REVISAO_PROPOSTA', 'NARRATIVA_RESULTADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NOVO', 'QUALIFICADO', 'SEM_INTERESSE', 'DDD_INDESEJADO', 'DDI_INDESEJADO', 'INVALIDO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'VENDEDOR',
    "segmento" "Segmento",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "phoneRaw" TEXT,
    "phoneNormalized" TEXT NOT NULL,
    "ddi" TEXT,
    "ddd" TEXT,
    "name" TEXT,
    "email" TEXT,
    "source" TEXT,
    "channel" TEXT,
    "adId" TEXT,
    "adTitle" TEXT,
    "adUrl" TEXT,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NOVO',
    "accountId" TEXT,
    "metaLeadEventSent" BOOLEAN NOT NULL DEFAULT false,
    "metaLeadEventId" TEXT,
    "metaLeadEventError" TEXT,
    "metaLeadEventSentAt" TIMESTAMP(3),
    "metaEventSent" BOOLEAN NOT NULL DEFAULT false,
    "metaEventId" TEXT,
    "metaEventError" TEXT,
    "metaEventSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "valorAnterior" JSONB,
    "valorNovo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpjRaiz" TEXT NOT NULL,
    "cnpjEstabelecimento" TEXT NOT NULL,
    "cnpjDv" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "segmento" "Segmento" NOT NULL,
    "redeOuGrupo" TEXT,
    "matrizId" TEXT,
    "endFaturamento" JSONB,
    "emailNf" TEXT,
    "origemId" TEXT,
    "parceiroId" TEXT,
    "responsavelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "contato" TEXT,
    "feePorc" DECIMAL(5,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOrigin" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoOrigem" NOT NULL,
    "parceiroId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LeadOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT NOT NULL,
    "cargo" TEXT,
    "area" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonRole" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "papel" "PapelPessoa" NOT NULL,
    "area" TEXT,
    "hierarquia" INTEGER,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "recebeNf" BOOLEAN NOT NULL DEFAULT false,
    "usuarioPortal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PersonRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "preset" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTransition" (
    "id" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "papeis" "Papel"[],

    CONSTRAINT "StageTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageHistory" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageConversionRate" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "segmento" "Segmento",
    "userId" TEXT,
    "taxa" DECIMAL(5,4) NOT NULL,
    "setadoPor" TEXT NOT NULL,
    "setadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageConversionRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "tipo" "TipoOpor" NOT NULL DEFAULT 'NOVA_VENDA',
    "oportunidadeRefId" TEXT,
    "valorTabela" DECIMAL(14,2),
    "valorProposto" DECIMAL(14,2),
    "desconto" DECIMAL(5,2),
    "previsaoFechamento" TIMESTAMP(3),
    "tempEstConversao" INTEGER,
    "resultado" "Resultado",
    "motivoPerda" TEXT,
    "alertaRetomada" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "participantes" TEXT[],
    "pauta" TEXT,
    "ata" TEXT,
    "proximosPassos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'RASCUNHO',
    "pacote" TEXT,
    "servico" TEXT NOT NULL,
    "valorTabela" DECIMAL(14,2) NOT NULL,
    "valorProposto" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(5,2) NOT NULL,
    "condicaoPromocional" DECIMAL(14,2),
    "duracaoPromocional" INTEGER,
    "valorCheio" DECIMAL(14,2),
    "implantacao" DECIMAL(14,2),
    "implantacaoIsenta" BOOLEAN NOT NULL DEFAULT false,
    "periodicidade" "Periodicidade" NOT NULL,
    "validadeProposta" TIMESTAMP(3) NOT NULL,
    "validadeContrato" INTEGER NOT NULL,
    "autoRenovacao" BOOLEAN NOT NULL DEFAULT true,
    "prazoPagamento" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalAdjustment" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "dataAlerta" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipoAjuste" "TipoAjuste" NOT NULL,
    "valorEstimado" DECIMAL(14,2),
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityMap" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "proposalId" TEXT,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoMapItem" NOT NULL,
    "descricao" TEXT,
    "responsavel" TEXT,
    "prazo" TIMESTAMP(3),
    "dependeDeId" TEXT,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestDrive" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "dataApresentacao" TIMESTAMP(3),
    "escopo" TEXT,
    "status" "StatusTestDrive" NOT NULL DEFAULT 'AGENDADO',
    "avaliacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scope" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "categorias" TEXT[],
    "regioes" TEXT[],
    "tipoMidia" TEXT[],
    "pracas" TEXT[],
    "relatorios" TEXT[],
    "periodoHistorico" INTEGER,
    "fontesInfo" TEXT[],

    CONSTRAINT "Scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingData" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "cnpjFaturamento" TEXT NOT NULL,
    "endFaturamento" JSONB NOT NULL,
    "emailNf" TEXT NOT NULL,
    "inicioFaturamento" TIMESTAMP(3) NOT NULL,
    "liberacaoAcesso" TIMESTAMP(3) NOT NULL,
    "inicioPrazoContagem" TIMESTAMP(3) NOT NULL,
    "responsavelContrato" TEXT NOT NULL,
    "aceiteContrato" BOOLEAN NOT NULL DEFAULT false,
    "aceiteEm" TIMESTAMP(3),
    "feeParceiroPorc" DECIMAL(5,2),
    "feeParceiroValor" DECIMAL(14,2),
    "feeLiquidado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BillingData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "leadId" TEXT,
    "cnpj" TEXT,
    "razaoSocial" TEXT,
    "phoneNormalized" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "datavenda" TIMESTAMP(3) NOT NULL,
    "origem" TEXT,
    "status" "StatusCasamento" NOT NULL DEFAULT 'NAO_CASADO',
    "importHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountPolicy" (
    "id" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "segmento" "Segmento",
    "tetoPorc" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "DiscountPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "apiKey" TEXT NOT NULL,
    "assistantId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "testedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "proposalId" TEXT,
    "tipo" "TipoAnalise" NOT NULL,
    "prompt" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "tokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_providerAccountId_key" ON "auth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_phoneNormalized_key" ON "Lead"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_ddd_idx" ON "Lead"("ddd");

-- CreateIndex
CREATE INDEX "Lead_channel_idx" ON "Lead"("channel");

-- CreateIndex
CREATE INDEX "Lead_utmCampaign_idx" ON "Lead"("utmCampaign");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "AuditLog_entidade_entidadeId_idx" ON "AuditLog"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Account_cnpjRaiz_idx" ON "Account"("cnpjRaiz");

-- CreateIndex
CREATE INDEX "Account_matrizId_idx" ON "Account"("matrizId");

-- CreateIndex
CREATE INDEX "Account_responsavelId_idx" ON "Account"("responsavelId");

-- CreateIndex
CREATE INDEX "Account_razaoSocial_idx" ON "Account"("razaoSocial");

-- CreateIndex
CREATE UNIQUE INDEX "Account_cnpjRaiz_cnpjEstabelecimento_key" ON "Account"("cnpjRaiz", "cnpjEstabelecimento");

-- CreateIndex
CREATE INDEX "Person_telefone_idx" ON "Person"("telefone");

-- CreateIndex
CREATE INDEX "Person_email_idx" ON "Person"("email");

-- CreateIndex
CREATE INDEX "PersonRole_accountId_area_idx" ON "PersonRole"("accountId", "area");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_preset_ordem_key" ON "Stage"("preset", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "StageTransition_fromStageId_toStageId_key" ON "StageTransition"("fromStageId", "toStageId");

-- CreateIndex
CREATE INDEX "StageHistory_opportunityId_createdAt_idx" ON "StageHistory"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "StageConversionRate_stageId_segmento_userId_idx" ON "StageConversionRate"("stageId", "segmento", "userId");

-- CreateIndex
CREATE INDEX "Opportunity_accountId_idx" ON "Opportunity"("accountId");

-- CreateIndex
CREATE INDEX "Opportunity_stageId_idx" ON "Opportunity"("stageId");

-- CreateIndex
CREATE INDEX "Opportunity_responsavelId_idx" ON "Opportunity"("responsavelId");

-- CreateIndex
CREATE INDEX "Opportunity_alertaRetomada_idx" ON "Opportunity"("alertaRetomada");

-- CreateIndex
CREATE INDEX "Meeting_opportunityId_dataHora_idx" ON "Meeting"("opportunityId", "dataHora");

-- CreateIndex
CREATE INDEX "Proposal_opportunityId_status_idx" ON "Proposal"("opportunityId", "status");

-- CreateIndex
CREATE INDEX "ProposalAdjustment_dataAlerta_idx" ON "ProposalAdjustment"("dataAlerta");

-- CreateIndex
CREATE INDEX "OpportunityMap_opportunityId_ordem_idx" ON "OpportunityMap"("opportunityId", "ordem");

-- CreateIndex
CREATE INDEX "OpportunityMap_prazo_idx" ON "OpportunityMap"("prazo");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_importHash_key" ON "Sale"("importHash");

-- CreateIndex
CREATE INDEX "Sale_cnpj_idx" ON "Sale"("cnpj");

-- CreateIndex
CREATE INDEX "Sale_phoneNormalized_idx" ON "Sale"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Sale_datavenda_idx" ON "Sale"("datavenda");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountPolicy_papel_segmento_key" ON "DiscountPolicy"("papel", "segmento");

-- CreateIndex
CREATE UNIQUE INDEX "AIIntegration_userId_key" ON "AIIntegration"("userId");

-- CreateIndex
CREATE INDEX "AIAnalysis_userId_createdAt_idx" ON "AIAnalysis"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_matrizId_fkey" FOREIGN KEY ("matrizId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "LeadOrigin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOrigin" ADD CONSTRAINT "LeadOrigin_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRole" ADD CONSTRAINT "PersonRole_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRole" ADD CONSTRAINT "PersonRole_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTransition" ADD CONSTRAINT "StageTransition_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageConversionRate" ADD CONSTRAINT "StageConversionRate_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageConversionRate" ADD CONSTRAINT "StageConversionRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageConversionRate" ADD CONSTRAINT "StageConversionRate_setadoPor_fkey" FOREIGN KEY ("setadoPor") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_oportunidadeRefId_fkey" FOREIGN KEY ("oportunidadeRefId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalAdjustment" ADD CONSTRAINT "ProposalAdjustment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityMap" ADD CONSTRAINT "OpportunityMap_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityMap" ADD CONSTRAINT "OpportunityMap_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityMap" ADD CONSTRAINT "OpportunityMap_dependeDeId_fkey" FOREIGN KEY ("dependeDeId") REFERENCES "OpportunityMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestDrive" ADD CONSTRAINT "TestDrive_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scope" ADD CONSTRAINT "Scope_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingData" ADD CONSTRAINT "BillingData_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIIntegration" ADD CONSTRAINT "AIIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
