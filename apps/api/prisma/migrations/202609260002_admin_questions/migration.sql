-- Support platform-wide question date ranges without changing existing messages.
CREATE INDEX "chat_messages_role_message_type_created_at_id_idx"
ON "chat_messages" ("role", "message_type", "created_at", "id");
