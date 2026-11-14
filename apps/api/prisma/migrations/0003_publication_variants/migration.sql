-- 科普版：按读者画像各存一版
CREATE TABLE "PublicationVariant" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "audienceName" TEXT NOT NULL,
    "audienceDescription" TEXT,
    "title" TEXT NOT NULL,
    "hook" TEXT,
    "bodyMd" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "quote" TEXT,
    "action" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "figureMermaid" TEXT,
    "aiAssisted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicationVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicationVariant_publicationId_idx" ON "PublicationVariant"("publicationId");

ALTER TABLE "PublicationVariant" ADD CONSTRAINT "PublicationVariant_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
