import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashPassword, passwordProblem, verifyPassword } from '../server/auth/password.js';
import { buildEmail } from '../server/mail.js';

test('hash and verify', async () => {
  const hash = await hashPassword('doğru-şifre-2026');
  assert.match(hash, /^scrypt\$65536\$8\$1\$/);
  assert.equal(await verifyPassword('doğru-şifre-2026', hash), true);
  assert.equal(await verifyPassword('yanlış-şifre-2026', hash), false);
});

test('same password, different hashes (random salt)', async () => {
  assert.notEqual(await hashPassword('aynı-şifre-123'), await hashPassword('aynı-şifre-123'));
});

test('Turkish letters typed in two ways match (NFC)', async () => {
  const composed = 'şifrem-2026x';
  const decomposed = composed.normalize('NFD'); // "s" + combining cedilla
  assert.notEqual(composed, decomposed);
  assert.equal(await verifyPassword(decomposed, await hashPassword(composed)), true);
});

test('unknown hash format is rejected, not a crash', async () => {
  assert.equal(await verifyPassword('anything', 'bcrypt$whatever'), false);
});

test('password rules', () => {
  const user = { email: 'ayse.yilmaz@example.com', name: 'Ayşe Yılmaz' };
  assert.equal(passwordProblem('kısa1', user), 'password_too_short');
  assert.equal(passwordProblem('a1'.repeat(70), user), 'password_too_long');
  assert.equal(passwordProblem('sadeceharfler', user), 'password_needs_letter_and_digit');
  assert.equal(passwordProblem('1234567890123', user), 'password_needs_letter_and_digit');
  assert.equal(passwordProblem('Password123', user), 'password_too_common');
  assert.equal(passwordProblem('ayse.yilmaz2026', user), 'password_contains_personal_info');
  assert.equal(passwordProblem('YILMAZ-kedi-77', user), 'password_contains_personal_info');
  assert.equal(passwordProblem('mavi-tren-sabah-42', user), null);
});

test('e-mail escapes the name the user typed', () => {
  const mail = buildEmail({
    kind: 'verify', lang: 'tr', name: '<img src=x onerror=alert(1)>', link: 'https://x.test/verify-email?token=abc', appName: 'Klasik Sinema',
  });
  assert.doesNotMatch(mail.html, /<img/);
  assert.match(mail.html, /&lt;img/);
  assert.match(mail.text, /https:\/\/x\.test\/verify-email\?token=abc/);
  assert.equal(buildEmail({ kind: 'reset', lang: 'en', name: 'A', link: 'l', appName: 'X' }).subject, 'Password reset');
});
