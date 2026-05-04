-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_ownerUserId_hash_key" ON "FileObject"("ownerUserId", "hash");

-- CreateIndex
CREATE INDEX "FileObject_ownerUserId_idx" ON "FileObject"("ownerUserId");

-- CreateIndex
CREATE INDEX "FileObject_hash_idx" ON "FileObject"("hash");

-- CreateTable
CREATE TABLE "SeriesAttachment" (
    "id" TEXT NOT NULL,
    "seriesId" INTEGER NOT NULL,
    "fileObjectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeriesAttachment_seriesId_idx" ON "SeriesAttachment"("seriesId");

-- CreateIndex
CREATE INDEX "SeriesAttachment_fileObjectId_idx" ON "SeriesAttachment"("fileObjectId");

-- AlterTable
ALTER TABLE "LessonAttachment" ADD COLUMN "fileObjectId" TEXT;

-- CreateIndex
CREATE INDEX "LessonAttachment_fileObjectId_idx" ON "LessonAttachment"("fileObjectId");

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesAttachment" ADD CONSTRAINT "SeriesAttachment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "LessonSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesAttachment" ADD CONSTRAINT "SeriesAttachment_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAttachment" ADD CONSTRAINT "LessonAttachment_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "FileObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
