import nodemailer, { type Transporter } from 'nodemailer';

let cached: Transporter | null = null;

export function getMailer(): Transporter | null {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cached;
}

export function fromAddress(): string {
  const name = process.env.SMTP_FROM_NAME ?? 'PathNotion';
  const email = process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? 'noreply@example.com';
  return `"${name}" <${email}>`;
}

export interface SendParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(params: SendParams): Promise<{ ok: true; messageId?: string; response?: string } | { ok: false; reason: string }> {
  const t = getMailer();
  if (!t) return { ok: false, reason: 'SMTP not configured' };
  const authUser = process.env.SMTP_USER!;
  try {
    const info = await t.sendMail({
      from: fromAddress(),
      // Envelope-from must match the authenticated user for most SMTP servers (incl. Fasthosts)
      envelope: { from: authUser, to: [params.to] },
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    // Log enough to chase a missing email later — subject, recipient, message-id the SMTP
    // server assigned, and its literal response line (usually '250 2.0.0 OK <id>').
    console.log(
      `[mailer] sent to=${params.to} subject="${params.subject.slice(0, 60)}" ` +
      `messageId=${info.messageId ?? '?'} response="${(info.response ?? '').replace(/\s+/g, ' ').slice(0, 200)}"`,
    );
    return { ok: true, messageId: info.messageId, response: info.response };
  } catch (err: any) {
    console.error(`[mailer] FAILED to=${params.to} subject="${params.subject.slice(0, 60)}" reason=${err?.response ?? err?.message}`);
    return { ok: false, reason: err?.response || err?.message || 'Send failed' };
  }
}
