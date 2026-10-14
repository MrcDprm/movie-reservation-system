// Password hashing with scrypt (built into Node, memory-hard, recommended by OWASP), and the
// rules a new password must pass.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// N = 2^16 needs 64 MB of memory per hash: expensive for an attacker with a GPU, about
// 0.1-0.3 s for one login on the server. Stored with the hash so it can be raised later.
const PARAMS = { N: 2 ** 16, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const KEY_LENGTH = 32;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFC'), salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password, stored) {
  const [algo, N, r, p, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64url');
  const params = { N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem };
  const key = await scryptAsync(password.normalize('NFC'), Buffer.from(salt, 'base64url'), expected.length, params);
  return timingSafeEqual(key, expected); // constant time: no hint from how long the check took
}

// A real hash of nothing, checked when an e-mail is unknown, so "no such user" and
// "wrong password" take the same time and cannot be told apart.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
}

// Short list of passwords that appear at the top of every leak; long enough to stop
// the obvious ones without shipping a large file.
const COMMON = new Set([
  '1234567890', '12345678910', 'qwertyuiop', 'password123', 'password1234', 'qwerty1234',
  '1q2w3e4r5t', 'abcdef1234', 'iloveyou123', 'sifre12345', 'parola1234', 'galatasaray1',
  'fenerbahce1', 'besiktas1903', 'trabzonspor1', 'asdfghjkl1', '123456789a', 'a123456789',
]);

// Returns null when the password is acceptable, otherwise a short error code.
export function passwordProblem(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string' || password.length < 10) return 'password_too_short';
  if (password.length > 128) return 'password_too_long';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'password_needs_letter_and_digit';
  const lower = password.toLocaleLowerCase('tr');
  if (COMMON.has(lower)) return 'password_too_common';
  const personal = [email.split('@')[0], ...name.split(/\s+/)]
    .map((part) => part.toLocaleLowerCase('tr'))
    .filter((part) => part.length >= 4);
  if (personal.some((part) => lower.includes(part))) return 'password_contains_personal_info';
  return null;
}
