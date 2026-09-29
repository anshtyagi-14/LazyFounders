-- Public site: "Talk to founder" chat. Visitors write from the widget, editors reply from Founder chat in the admin console.

CREATE TABLE "founder_chats" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "token_hash" TEXT NOT NULL,
    "page_path" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "referrer" TEXT,
    "unread_by_admin" INTEGER NOT NULL DEFAULT 0,
    "unread_by_visitor" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founder_chats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "founder_chat_messages" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "editor" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "founder_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "founder_chats_status_last_message_at_idx" ON "founder_chats"("status", "last_message_at");
CREATE INDEX "founder_chat_messages_chat_id_created_at_idx" ON "founder_chat_messages"("chat_id", "created_at");

ALTER TABLE "founder_chat_messages" ADD CONSTRAINT "founder_chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "founder_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
