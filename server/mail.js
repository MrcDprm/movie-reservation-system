// E-mail through Resend's HTTP API (plain fetch, no SDK). Without an API key (local development)
// the message is printed to the console instead, so the links can still be clicked.

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TEXTS = {
  tr: {
    verify: {
      subject: 'Hesabını oluştur',
      // No name here: it is chosen on the page this link opens.
      lines: () => ['Merhaba,', 'Hesabını oluşturmak için bu bağlantıyı aç; adını ve şifreni orada belirleyeceksin. Bağlantı 24 saat geçerli.', 'Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.'],
      button: 'Hesabımı oluştur',
    },
    reset: {
      subject: 'Şifre sıfırlama',
      lines: (name) => [`Merhaba ${name},`, 'Yeni bir şifre belirlemek için bu bağlantıyı aç. Bağlantı 1 saat geçerli.', 'Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.'],
      button: 'Yeni şifre belirle',
    },
    existing: {
      subject: 'Bu adresle zaten bir hesabın var',
      lines: (name) => [`Merhaba ${name},`, 'Biri bu e-posta adresiyle yeniden kayıt olmaya çalıştı. Şifreni hatırlamıyorsan buradan sıfırlayabilirsin.', 'Bu sen değilsen bir şey yapmana gerek yok.'],
      button: 'Şifremi sıfırla',
    },
  },
  en: {
    verify: {
      subject: 'Create your account',
      lines: () => ['Hello,', 'Open this link to create your account; you will choose your name and password there. It is valid for 24 hours.', 'If you did not ask for this, you can ignore this e-mail.'],
      button: 'Create my account',
    },
    reset: {
      subject: 'Password reset',
      lines: (name) => [`Hello ${name},`, 'Open this link to set a new password. It is valid for 1 hour.', 'If you did not ask for this, you can ignore this e-mail.'],
      button: 'Set a new password',
    },
    existing: {
      subject: 'You already have an account with this address',
      lines: (name) => [`Hello ${name},`, 'Someone tried to register again with this e-mail address. If you forgot your password, you can reset it here.', 'If this was not you, you do not need to do anything.'],
      button: 'Reset my password',
    },
  },
};

export function buildEmail({ kind, lang, name, link, appName }) {
  const t = (TEXTS[lang] ?? TEXTS.tr)[kind];
  const lines = t.lines(name);
  const text = [...lines, '', link, '', appName].join('\n');
  // Everything that came from a user (the name) is escaped before it goes into the HTML.
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1b1712;background:#f4efe6;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fffdf8;padding:28px;border-radius:8px">
<p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8a6a2c">${escapeHtml(appName)}</p>
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')}
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#7a2e22;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(t.button)}</a></p>
<p style="font-size:12px;color:#6b6257;word-break:break-all">${escapeHtml(link)}</p>
</div></body></html>`;
  return { subject: t.subject, text, html };
}

const TICKET_TEXTS = {
  tr: {
    subject: (title) => `Biletlerin: ${title}`,
    hello: (name) => `Merhaba ${name}, ödemen alındı. İyi seyirler!`,
    seats: 'Koltuklar',
    qr: 'Her koltuğun QR kodu ekte. Kapıda telefonundan göstermen yeterli; biletlerini sitede de görebilirsin.',
    button: 'Biletlerimi göster',
  },
  en: {
    subject: (title) => `Your tickets: ${title}`,
    hello: (name) => `Hello ${name}, your payment was received. Enjoy the film!`,
    seats: 'Seats',
    qr: 'The QR code of each seat is attached. Show it on your phone at the door; your tickets are on the site too.',
    button: 'Show my tickets',
  },
};

export function buildTicketEmail({ lang, name, title, when, hall, seats, link, appName }) {
  const t = TICKET_TEXTS[lang] ?? TICKET_TEXTS.tr;
  const details = [title, when, hall, `${t.seats}: ${seats.join(', ')}`];
  const text = [t.hello(name), '', ...details, '', t.qr, link, '', appName].join('\n');
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#1b1712;background:#f4efe6;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fffdf8;padding:28px;border-radius:8px">
<p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#8a6a2c">${escapeHtml(appName)}</p>
<p>${escapeHtml(t.hello(name))}</p>
<p style="font-size:20px;margin:16px 0 4px"><strong>${escapeHtml(title)}</strong></p>
${details.slice(1).map((d) => `<p style="margin:2px 0">${escapeHtml(d)}</p>`).join('\n')}
<p style="margin-top:16px">${escapeHtml(t.qr)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#7a2e22;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(t.button)}</a></p>
</div></body></html>`;
  return { subject: t.subject(title), text, html };
}

export function createMailer(config, fetchImpl = fetch) {
  return {
    // attachments: [{ filename, content: Buffer }]
    async send({ to, subject, text, html, attachments = [] }) {
      if (!config.RESEND_API_KEY) {
        console.log(`[mail] to=${to} subject="${subject}" attachments=${attachments.length}\n${text}`);
        return;
      }
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: config.EMAIL_FROM, to, subject, text, html,
          attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
        }),
      });
      if (!response.ok) {
        // The status is enough to debug; the response body could echo the address.
        throw new Error(`Resend responded ${response.status}`);
      }
    },
  };
}
