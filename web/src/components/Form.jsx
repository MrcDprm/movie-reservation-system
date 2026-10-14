// Small building blocks shared by the account pages.
import { useId } from 'react';
import { Link } from 'react-router-dom';

export function AuthCard({ title, children, footer }) {
  return (
    <div className="mx-auto max-w-md px-4 pt-12 sm:pt-16">
      <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-6">{children}</div>
      {footer && <div className="mt-5 text-sm text-ink-2">{footer}</div>}
    </div>
  );
}

export function Field({ label, hint, ...input }) {
  const id = useId();
  // The hint sits outside the label: screen readers read it as a description, not as the field name.
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="rounded-lg border border-line bg-bg px-3 py-2.5 text-ink outline-none placeholder:text-ink-3 focus:border-velvet"
        {...input}
      />
      {hint && (
        <span id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </span>
      )}
    </div>
  );
}

export function Submit({ children, busy, ...props }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-lg bg-velvet px-4 py-3 font-semibold text-on-velvet hover:bg-velvet-strong disabled:opacity-60"
      {...props}
    >
      {children}
    </button>
  );
}

export function Notice({ kind = 'error', children }) {
  const color = { error: 'border-danger/40 text-danger', ok: 'border-ok/40 text-ok', info: 'border-line text-ink-2' }[kind];
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border bg-bg px-3 py-2.5 text-sm ${color}`}>
      {children}
    </p>
  );
}

export function TextLink({ to, children }) {
  return (
    <Link to={to} className="font-semibold text-velvet-strong underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

// Only our own pages: "//evil.com" or "https://..." would send people to another site after login.
export function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';
}
