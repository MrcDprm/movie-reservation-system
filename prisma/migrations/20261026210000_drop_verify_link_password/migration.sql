-- Sign-up links no longer carry a password (it is chosen on the link page); the live code
-- stopped writing this column with the previous release.
-- AlterTable
ALTER TABLE "EmailToken" DROP COLUMN "passwordHash";
