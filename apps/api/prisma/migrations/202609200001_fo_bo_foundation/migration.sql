-- CreateEnum
CREATE TYPE "OfficeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OFFICE_ADMIN', 'DISPATCHER', 'LAWYER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('USER_QUESTION', 'AI_ANSWER', 'NON_LEGAL_NOTICE', 'SYSTEM_NOTICE');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('REQUESTED', 'ASSIGNED', 'REVIEWING', 'ANSWERED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewResult" AS ENUM ('GENERALLY_VALID', 'PARTIALLY_VALID', 'IMPORTANT_OMISSION', 'MORE_FACTS_NEEDED', 'CONSULTATION_RECOMMENDED', 'AI_ANSWER_INAPPROPRIATE');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('LAWYER_REVIEW_INVITATION', 'USER_LAWYER_REPLY');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('ANONYMOUS_SESSION', 'STAFF', 'LAWYER_REVIEW_SESSION', 'SYSTEM');

-- AlterTable
ALTER TABLE "law_offices" ADD COLUMN     "contact_email" VARCHAR(254),
ADD COLUMN     "phone" VARCHAR(40),
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "status" "OfficeStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "lawyers" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "registration_number" VARCHAR(50),
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assignment_enabled" BOOLEAN NOT NULL DEFAULT false,
    "receive_verification_email" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lawyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_accounts" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "lawyer_id" UUID,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "StaffRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_sessions" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "staff_account_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyer_employments" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "lawyer_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "status" "EmploymentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lawyer_employments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyer_leaves" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "lawyer_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lawyer_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "session_token_hash" VARCHAR(64) NOT NULL,
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "max_question_count" INTEGER DEFAULT 3,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "parent_message_id" UUID,
    "request_key" VARCHAR(100),
    "role" "MessageRole" NOT NULL,
    "message_type" "MessageType" NOT NULL,
    "content" TEXT NOT NULL,
    "sanitized_content" TEXT,
    "sequence_no" INTEGER NOT NULL,
    "processing_status" "ProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question_message_id" UUID NOT NULL,
    "ai_answer_message_id" UUID NOT NULL,
    "requester_email" VARCHAR(254) NOT NULL,
    "additional_context" TEXT,
    "question_snapshot" TEXT NOT NULL,
    "ai_answer_snapshot" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'REQUESTED',
    "assigned_lawyer_id" UUID,
    "assignment_version" INTEGER NOT NULL DEFAULT 0,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMPTZ(3),
    "claimed_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_invitations" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "lawyer_id" UUID NOT NULL,
    "assignment_version" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sessions" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_history" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "assignment_version" INTEGER NOT NULL,
    "from_lawyer_id" UUID,
    "to_lawyer_id" UUID,
    "reason" TEXT NOT NULL,
    "actor_staff_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyer_replies" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "lawyer_id" UUID NOT NULL,
    "assignment_version" INTEGER NOT NULL,
    "result_type" "ReviewResult" NOT NULL,
    "reply_body" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lawyer_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "verification_request_id" UUID NOT NULL,
    "invitation_id" UUID,
    "reply_id" UUID,
    "recipient" VARCHAR(254) NOT NULL,
    "event_type" "EmailEventType" NOT NULL,
    "deduplication_key" VARCHAR(200) NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(3),
    "provider_message_id" VARCHAR(255),
    "last_error_code" VARCHAR(100),
    "encrypted_payload" BYTEA,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_attempts" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "email_outbox_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "provider_message_id" VARCHAR(255),
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "email_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "law_office_id" UUID NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lawyers_law_office_id_approval_status_is_active_assignment__idx" ON "lawyers"("law_office_id", "approval_status", "is_active", "assignment_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "lawyers_law_office_id_id_key" ON "lawyers"("law_office_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lawyers_law_office_id_email_key" ON "lawyers"("law_office_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "lawyers_law_office_id_registration_number_key" ON "lawyers"("law_office_id", "registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "staff_accounts_lawyer_id_key" ON "staff_accounts"("lawyer_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_accounts_law_office_id_id_key" ON "staff_accounts"("law_office_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_accounts_law_office_id_email_key" ON "staff_accounts"("law_office_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_accounts_law_office_id_lawyer_id_key" ON "staff_accounts"("law_office_id", "lawyer_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "staff_sessions_law_office_id_staff_account_id_expires_at_idx" ON "staff_sessions"("law_office_id", "staff_account_id", "expires_at");

-- CreateIndex
CREATE INDEX "lawyer_employments_law_office_id_lawyer_id_starts_at_ends_a_idx" ON "lawyer_employments"("law_office_id", "lawyer_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "lawyer_leaves_law_office_id_lawyer_id_status_starts_at_ends_idx" ON "lawyer_leaves"("law_office_id", "lawyer_id", "status", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_session_token_hash_key" ON "chat_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "chat_sessions_law_office_id_expires_at_idx" ON "chat_sessions"("law_office_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_law_office_id_id_key" ON "chat_sessions"("law_office_id", "id");

-- CreateIndex
CREATE INDEX "chat_messages_law_office_id_session_id_parent_message_id_idx" ON "chat_messages"("law_office_id", "session_id", "parent_message_id");

-- CreateIndex
CREATE INDEX "chat_messages_law_office_id_processing_status_created_at_idx" ON "chat_messages"("law_office_id", "processing_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_law_office_id_session_id_id_key" ON "chat_messages"("law_office_id", "session_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_law_office_id_session_id_id_parent_message_id_key" ON "chat_messages"("law_office_id", "session_id", "id", "parent_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_session_id_sequence_no_key" ON "chat_messages"("session_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_session_id_request_key_key" ON "chat_messages"("session_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_ai_answer_message_id_key" ON "verification_requests"("ai_answer_message_id");

-- CreateIndex
CREATE INDEX "verification_requests_law_office_id_status_requested_at_idx" ON "verification_requests"("law_office_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "verification_requests_law_office_id_assigned_lawyer_id_stat_idx" ON "verification_requests"("law_office_id", "assigned_lawyer_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "verification_requests_law_office_id_session_id_idx" ON "verification_requests"("law_office_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_requests_law_office_id_id_key" ON "verification_requests"("law_office_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "review_invitations_token_hash_key" ON "review_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "review_invitations_law_office_id_lawyer_id_expires_at_idx" ON "review_invitations"("law_office_id", "lawyer_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_invitations_law_office_id_verification_request_id_id_key" ON "review_invitations"("law_office_id", "verification_request_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "review_invitations_verification_request_id_assignment_versi_key" ON "review_invitations"("verification_request_id", "assignment_version", "lawyer_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_sessions_token_hash_key" ON "review_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "review_sessions_law_office_id_verification_request_id_expir_idx" ON "review_sessions"("law_office_id", "verification_request_id", "expires_at");

-- CreateIndex
CREATE INDEX "assignment_history_law_office_id_created_at_idx" ON "assignment_history"("law_office_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_history_verification_request_id_assignment_versi_key" ON "assignment_history"("verification_request_id", "assignment_version");

-- CreateIndex
CREATE UNIQUE INDEX "lawyer_replies_verification_request_id_key" ON "lawyer_replies"("verification_request_id");

-- CreateIndex
CREATE INDEX "lawyer_replies_law_office_id_lawyer_id_submitted_at_idx" ON "lawyer_replies"("law_office_id", "lawyer_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "lawyer_replies_law_office_id_verification_request_id_key" ON "lawyer_replies"("law_office_id", "verification_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "lawyer_replies_law_office_id_verification_request_id_id_key" ON "lawyer_replies"("law_office_id", "verification_request_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_deduplication_key_key" ON "email_outbox"("deduplication_key");

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_lease_until_idx" ON "email_outbox"("status", "next_attempt_at", "lease_until");

-- CreateIndex
CREATE INDEX "email_outbox_law_office_id_verification_request_id_created__idx" ON "email_outbox"("law_office_id", "verification_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_law_office_id_id_key" ON "email_outbox"("law_office_id", "id");

-- CreateIndex
CREATE INDEX "email_delivery_attempts_law_office_id_started_at_idx" ON "email_delivery_attempts"("law_office_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_attempts_email_outbox_id_attempt_no_key" ON "email_delivery_attempts"("email_outbox_id", "attempt_no");

-- CreateIndex
CREATE INDEX "audit_logs_law_office_id_entity_type_entity_id_created_at_idx" ON "audit_logs"("law_office_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_law_office_id_actor_type_actor_id_created_at_idx" ON "audit_logs"("law_office_id", "actor_type", "actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "lawyers" ADD CONSTRAINT "lawyers_law_office_id_fkey" FOREIGN KEY ("law_office_id") REFERENCES "law_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_law_office_id_fkey" FOREIGN KEY ("law_office_id") REFERENCES "law_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_law_office_id_lawyer_id_fkey" FOREIGN KEY ("law_office_id", "lawyer_id") REFERENCES "lawyers"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_law_office_id_staff_account_id_fkey" FOREIGN KEY ("law_office_id", "staff_account_id") REFERENCES "staff_accounts"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lawyer_employments" ADD CONSTRAINT "lawyer_employments_law_office_id_lawyer_id_fkey" FOREIGN KEY ("law_office_id", "lawyer_id") REFERENCES "lawyers"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lawyer_employments" ADD CONSTRAINT "lawyer_employments_law_office_id_created_by_fkey" FOREIGN KEY ("law_office_id", "created_by") REFERENCES "staff_accounts"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lawyer_leaves" ADD CONSTRAINT "lawyer_leaves_law_office_id_lawyer_id_fkey" FOREIGN KEY ("law_office_id", "lawyer_id") REFERENCES "lawyers"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lawyer_leaves" ADD CONSTRAINT "lawyer_leaves_law_office_id_approved_by_fkey" FOREIGN KEY ("law_office_id", "approved_by") REFERENCES "staff_accounts"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_law_office_id_fkey" FOREIGN KEY ("law_office_id") REFERENCES "law_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_law_office_id_session_id_fkey" FOREIGN KEY ("law_office_id", "session_id") REFERENCES "chat_sessions"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_law_office_id_session_id_parent_message_id_fkey" FOREIGN KEY ("law_office_id", "session_id", "parent_message_id") REFERENCES "chat_messages"("law_office_id", "session_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_law_office_id_session_id_fkey" FOREIGN KEY ("law_office_id", "session_id") REFERENCES "chat_sessions"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_law_office_id_session_id_question_me_fkey" FOREIGN KEY ("law_office_id", "session_id", "question_message_id") REFERENCES "chat_messages"("law_office_id", "session_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_law_office_id_session_id_ai_answer_m_fkey" FOREIGN KEY ("law_office_id", "session_id", "ai_answer_message_id", "question_message_id") REFERENCES "chat_messages"("law_office_id", "session_id", "id", "parent_message_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_law_office_id_assigned_lawyer_id_fkey" FOREIGN KEY ("law_office_id", "assigned_lawyer_id") REFERENCES "lawyers"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_law_office_id_verification_request_id_fkey" FOREIGN KEY ("law_office_id", "verification_request_id") REFERENCES "verification_requests"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_law_office_id_lawyer_id_fkey" FOREIGN KEY ("law_office_id", "lawyer_id") REFERENCES "lawyers"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_law_office_id_verification_request_id_invi_fkey" FOREIGN KEY ("law_office_id", "verification_request_id", "invitation_id") REFERENCES "review_invitations"("law_office_id", "verification_request_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_law_office_id_verification_request_id_fkey" FOREIGN KEY ("law_office_id", "verification_request_id") REFERENCES "verification_requests"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_law_office_id_from_lawyer_id_fkey" FOREIGN KEY ("law_office_id", "from_lawyer_id") REFERENCES "lawyers"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_law_office_id_to_lawyer_id_fkey" FOREIGN KEY ("law_office_id", "to_lawyer_id") REFERENCES "lawyers"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_law_office_id_actor_staff_id_fkey" FOREIGN KEY ("law_office_id", "actor_staff_id") REFERENCES "staff_accounts"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lawyer_replies" ADD CONSTRAINT "lawyer_replies_law_office_id_verification_request_id_fkey" FOREIGN KEY ("law_office_id", "verification_request_id") REFERENCES "verification_requests"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lawyer_replies" ADD CONSTRAINT "lawyer_replies_law_office_id_lawyer_id_fkey" FOREIGN KEY ("law_office_id", "lawyer_id") REFERENCES "lawyers"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_law_office_id_verification_request_id_fkey" FOREIGN KEY ("law_office_id", "verification_request_id") REFERENCES "verification_requests"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_law_office_id_verification_request_id_invitat_fkey" FOREIGN KEY ("law_office_id", "verification_request_id", "invitation_id") REFERENCES "review_invitations"("law_office_id", "verification_request_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_law_office_id_verification_request_id_reply_i_fkey" FOREIGN KEY ("law_office_id", "verification_request_id", "reply_id") REFERENCES "lawyer_replies"("law_office_id", "verification_request_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_attempts" ADD CONSTRAINT "email_delivery_attempts_law_office_id_email_outbox_id_fkey" FOREIGN KEY ("law_office_id", "email_outbox_id") REFERENCES "email_outbox"("law_office_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_law_office_id_fkey" FOREIGN KEY ("law_office_id") REFERENCES "law_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
