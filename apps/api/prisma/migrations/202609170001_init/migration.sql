CREATE TABLE "law_offices" (
  "id" UUID NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "law_offices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "law_offices_code_key" ON "law_offices"("code");
