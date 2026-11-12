-- CreateEnum
CREATE TYPE "CatalogTipo" AS ENUM ('CATEGORIA', 'UF', 'RELATORIO', 'TIPO_MIDIA', 'PRACA', 'FONTE_INFO');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "statusManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Stage" ADD COLUMN     "resultado" "Resultado";

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "tipo" "CatalogTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogItem_tipo_ativo_ordem_idx" ON "CatalogItem"("tipo", "ativo", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_tipo_nome_key" ON "CatalogItem"("tipo", "nome");
