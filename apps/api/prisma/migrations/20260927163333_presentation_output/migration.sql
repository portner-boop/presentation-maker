-- AlterTable
ALTER TABLE "Presentation" ADD COLUMN     "fileKey" TEXT,
ADD COLUMN     "scriptKey" TEXT,
ADD COLUMN     "sourcesKey" TEXT,
ADD COLUMN     "stats" JSONB;
