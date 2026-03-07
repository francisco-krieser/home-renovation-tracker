-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "current_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "job_history" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_history_job_id_version_key" ON "job_history"("job_id", "version");

-- AddForeignKey
ALTER TABLE "job_history" ADD CONSTRAINT "job_history_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_history" ADD CONSTRAINT "job_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
