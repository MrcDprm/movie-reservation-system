// Random tokens for session cookies and e-mail links. The database stores only a SHA-256
// hash: someone who reads the database still cannot log in or use a link.
import { createHash, randomBytes } from 'node:crypto';

export const newToken = () => randomBytes(32).toString('base64url'); // 256 bits

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'sid';

export function sessionCookieOptions(config) {
  return {
    httpOnly: true, // not readable from JavaScript, so an XSS bug cannot steal it
    secure: config.NODE_ENV === 'production', // https only (local dev runs on http)
    sameSite: 'lax', // not sent with cross-site POSTs
    path: '/',
    maxAge: SESSION_DAYS * 86_400_000,
  };
}

export async function createSession(prisma, userId, now = new Date()) {
  const token = newToken();
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000) },
  });
  return token;
}

const EMAIL_TOKEN_TTL = { VERIFY_EMAIL: 24 * 3_600_000, RESET_PASSWORD: 3_600_000 };

// `passwordHash`: the password chosen in the sign-up that sent this link (sign-up links only).
export async function createEmailToken(prisma, userId, type, { passwordHash = null, now = new Date() } = {}) {
  // Only the newest reset link works. Sign-up links are kept: each carries its own password,
  // and a later sign-up by someone else must not cancel the owner's own link.
  if (type === 'RESET_PASSWORD') await prisma.emailToken.deleteMany({ where: { userId, type, usedAt: null } });
  const token = newToken();
  await prisma.emailToken.create({
    data: { tokenHash: hashToken(token), type, userId, passwordHash, expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL[type]) },
  });
  return token;
}

// Marks the token used and returns { userId, passwordHash }, or null if it is unknown, used or
// expired. updateMany with usedAt: null makes it single-use even if clicked twice at once.
export async function consumeEmailToken(prisma, token, type, now = new Date()) {
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.type !== type || record.expiresAt <= now) return null;
  const { count } = await prisma.emailToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  return count === 1 ? { userId: record.userId, passwordHash: record.passwordHash } : null;
}
