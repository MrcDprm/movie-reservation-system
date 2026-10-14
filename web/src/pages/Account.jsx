// Account pages: log in, register, confirm e-mail, forgot and reset password.
// The server decides everything; these pages only send the form and show its answer.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AuthCard, Field, Notice, Submit, TextLink, safeNext } from '../components/Form.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { usePrefs } from '../lib/prefs.jsx';

// A quick hint while typing; the real check is on the server (passwordProblem).
function passwordHint(password, t) {
  if (password.length > 0 && password.length < 10) return t('auth.rule.length');
  if (password.length >= 10 && !(/\p{L}/u.test(password) && /\d/.test(password))) return t('auth.rule.mix');
  return t('auth.rule.all');
}

function useSubmit(action) {
  const { t } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action(Object.fromEntries(new FormData(event.currentTarget)));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, errorText: error ? t(`error.${error.code}`) : null, run };
}

export function Login() {
  const { t, lang } = usePrefs();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);

  const { busy, error, errorText, run } = useSubmit(async (form) => {
    const { user } = await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
    setUser(user);
    navigate(next, { replace: true });
  });

  const resend = async () => {
    await api('/auth/resend-verification', { method: 'POST', body: { email, lang } }).catch(() => {});
    setResent(true);
  };

  return (
    <AuthCard
      title={t('auth.login.title')}
      footer={
        <>
          {t('auth.login.noAccount')} <TextLink to={`/register?next=${encodeURIComponent(next)}`}>{t('auth.register.title')}</TextLink>
        </>
      }
    >
      <form onSubmit={run} className="grid gap-4" noValidate>
        <Field label={t('auth.email')} name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('auth.password')} name="password" type="password" autoComplete="current-password" required />
        {error && <Notice>{errorText}</Notice>}
        {error?.code === 'email_not_verified' && !resent && (
          <button type="button" onClick={resend} className="text-left text-sm font-semibold text-velvet-strong hover:underline">
            {t('auth.resend')}
          </button>
        )}
        {resent && <Notice kind="ok">{t('auth.resent')}</Notice>}
        <Submit busy={busy}>{t('auth.login.submit')}</Submit>
        <TextLink to="/forgot-password">{t('auth.forgot.link')}</TextLink>
      </form>
    </AuthCard>
  );
}

export function Register() {
  const { t, lang } = usePrefs();
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState(null);

  const { busy, errorText, run } = useSubmit(async (form) => {
    await api('/auth/register', { method: 'POST', body: { name: form.name, email: form.email, password: form.password, lang } });
    setSentTo(form.email);
  });

  if (sentTo) {
    return (
      <AuthCard title={t('auth.checkEmail.title')}>
        <p className="text-ink-2">{t('auth.checkEmail.text', { email: sentTo })}</p>
        <p className="mt-3 text-sm text-ink-3">{t('auth.checkEmail.spam')}</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('auth.register.title')}
      footer={
        <>
          {t('auth.register.haveAccount')} <TextLink to="/login">{t('auth.login.title')}</TextLink>
        </>
      }
    >
      <form onSubmit={run} className="grid gap-4" noValidate>
        <Field label={t('auth.name')} name="name" autoComplete="name" required maxLength={60} />
        <Field label={t('auth.email')} name="email" type="email" autoComplete="email" required />
        <Field
          label={t('auth.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={passwordHint(password, t)}
        />
        {errorText && <Notice>{errorText}</Notice>}
        <Submit busy={busy}>{t('auth.register.submit')}</Submit>
      </form>
    </AuthCard>
  );
}

export function VerifyEmail() {
  const { t } = usePrefs();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // The link works once; React runs effects twice in development, so guard against a second call.
    if (started.current) return;
    started.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token: params.get('token') ?? '' } })
      .then(({ user }) => {
        setUser(user);
        navigate('/?welcome=1', { replace: true });
      })
      .catch(() => setFailed(true));
  }, [params, setUser, navigate]);

  return (
    <AuthCard title={t('auth.verify.title')}>
      {failed ? (
        <>
          <Notice>{t('error.invalid_or_expired_link')}</Notice>
          <p className="mt-4 text-sm text-ink-2">
            {t('auth.verify.again')} <TextLink to="/login">{t('auth.login.title')}</TextLink>
          </p>
        </>
      ) : (
        <p className="text-ink-2">{t('auth.verify.working')}</p>
      )}
    </AuthCard>
  );
}

export function ForgotPassword() {
  const { t, lang } = usePrefs();
  const [sent, setSent] = useState(false);
  const { busy, errorText, run } = useSubmit(async (form) => {
    await api('/auth/forgot-password', { method: 'POST', body: { email: form.email, lang } });
    setSent(true);
  });

  return (
    <AuthCard title={t('auth.forgot.title')}>
      {sent ? (
        <Notice kind="ok">{t('auth.forgot.sent')}</Notice>
      ) : (
        <form onSubmit={run} className="grid gap-4" noValidate>
          <p className="text-sm text-ink-2">{t('auth.forgot.text')}</p>
          <Field label={t('auth.email')} name="email" type="email" autoComplete="email" required />
          {errorText && <Notice>{errorText}</Notice>}
          <Submit busy={busy}>{t('auth.forgot.submit')}</Submit>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const { t } = usePrefs();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const { busy, errorText, run } = useSubmit(async (form) => {
    const { user } = await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token') ?? '', password: form.password } });
    setUser(user);
    navigate('/?reset=1', { replace: true });
  });

  return (
    <AuthCard title={t('auth.reset.title')}>
      <form onSubmit={run} className="grid gap-4" noValidate>
        <Field
          label={t('auth.newPassword')}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={passwordHint(password, t)}
        />
        {errorText && <Notice>{errorText}</Notice>}
        <Submit busy={busy}>{t('auth.reset.submit')}</Submit>
      </form>
    </AuthCard>
  );
}
