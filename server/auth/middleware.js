// Reads the session cookie and attaches the user to the request; guards for routes.
import { AppError } from '../errors.js';
import { SESSION_COOKIE, hashToken } from './tokens.js';

export function loadUser(db) {
  return async (req, res, next) => {
    req.user = null;
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 20) {
      const session = await db().session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (session && session.expiresAt > new Date()) {
        req.user = session.user;
        req.sessionId = session.id;
      }
    }
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) throw new AppError(401, 'unauthorized');
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) throw new AppError(401, 'unauthorized');
  if (!roles.includes(req.user.role)) throw new AppError(403, 'forbidden');
  next();
};

// What the browser may know about a user (never the password hash).
export const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  emailVerified: Boolean(user.emailVerifiedAt),
});
