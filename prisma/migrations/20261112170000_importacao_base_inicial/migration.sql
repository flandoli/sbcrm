-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('PROSPECT', 'CLIENTE');

-- CreateEnum
CREATE TYPE "TipoProduto" AS ENUM ('PRODUTO', 'SERVICO');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cnpjProvisorio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "importKey" TEXT,
ADD COLUMN     "statusConta" "StatusConta" NOT NULL DEFAULT 'PROSPECT';

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "importKey" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "importKey" TEXT;

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "userId" TEXT,
    "texto" TEXT NOT NULL,
    "origem" TEXT,
    "importKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoProduto" NOT NULL DEFAULT 'SERVICO',
    "segmento" "Segmento",
    "tipoMidia" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "parentId" TEXT,
    "faixa" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Note_importKey_key" ON "Note"("importKey");

-- CreateIndex
CREATE INDEX "Note_accountId_createdAt_idx" ON "Note"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_opportunityId_idx" ON "Note"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_codigo_key" ON "Product"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_caminho_key" ON "ProductCategory"("caminho");

-- CreateIndex
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");

-- CreateIndex
CREATE INDEX "ProductCategory_nivel_nome_idx" ON "ProductCategory"("nivel", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Account_importKey_key" ON "Account"("importKey");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_importKey_key" ON "Opportunity"("importKey");

-- CreateIndex
CREATE UNIQUE INDEX "Person_importKey_key" ON "Person"("importKey");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

