-- Sign-up no longer takes a password: it is chosen on the page the confirmation link opens.
-- Safe to apply before the new code is deployed (the old code always sets a password).
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
