import nodemailer from 'nodemailer';
export interface OutgoingEmail {
  recipient: string;
  subject: string;
  text: string;
  html?: string;
  messageKey: string;
}
export interface EmailProvider {
  send(message: OutgoingEmail): Promise<void>;
}

export class EmailTransportError extends Error {
  constructor(
    readonly code:
      | 'CONNECTION'
      | 'AUTHENTICATION'
      | 'REJECTED'
      | 'RATE_LIMIT'
      | 'DELIVERY_ERROR'
      | 'CONFIGURATION',
  ) {
    super(code);
  }
}
function cleanError(error: unknown): EmailTransportError {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return new EmailTransportError(
    code === 'EAUTH'
      ? 'AUTHENTICATION'
      : ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(code)
        ? 'CONNECTION'
        : ['EENVELOPE', 'EMESSAGE'].includes(code)
          ? 'REJECTED'
          : 'DELIVERY_ERROR',
  );
}
export function createEmailProvider(env: NodeJS.ProcessEnv): EmailProvider | undefined {
  const transport = env.EMAIL_TRANSPORT ?? 'disabled';
  if (transport === 'disabled') return undefined;
  const from = env.EMAIL_FROM ?? '';
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from))
    throw new EmailTransportError('CONFIGURATION');
  if (transport === 'resend') {
    const key = env.RESEND_API_KEY;
    if (!key || /[\r\n]/.test(key)) throw new EmailTransportError('CONFIGURATION');
    return {
      async send(message: OutgoingEmail) {
        try {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': message.messageKey,
            },
            body: JSON.stringify({
              from: `AI QAVER <${from}>`,
              to: [message.recipient],
              subject: message.subject,
              text: message.text,
              html: message.html,
            }),
            signal: AbortSignal.timeout(30000),
          });
          // Discard provider responses even on errors; SMTP/HTTP services may echo submitted text.
          await response.body?.cancel();
          if (!response.ok)
            throw new EmailTransportError(
              response.status === 429
                ? 'RATE_LIMIT'
                : [401, 403].includes(response.status)
                  ? 'AUTHENTICATION'
                  : response.status >= 500
                    ? 'DELIVERY_ERROR'
                    : 'REJECTED',
            );
        } catch (error) {
          throw error instanceof EmailTransportError
            ? error
            : new EmailTransportError('CONNECTION');
        }
      },
    };
  }
  if (transport !== 'smtp') throw new EmailTransportError('CONFIGURATION');
  const host = env.SMTP_HOST ?? '',
    port = Number(env.SMTP_PORT ?? 587);
  const secure = env.SMTP_SECURE === 'true';
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const insecure = env.SMTP_ALLOW_INSECURE === 'true';
  if (
    !host ||
    /\s/.test(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (insecure && (env.NODE_ENV === 'production' || !loopback)) ||
    (Boolean(env.SMTP_PASSWORD) && !env.SMTP_USER)
  )
    throw new EmailTransportError('CONFIGURATION');
  // Keep queued mail untouched while the operator enters the app password in runtime variables.
  if (env.SMTP_USER && !env.SMTP_PASSWORD) return undefined;
  const client = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !insecure && !secure,
    ignoreTLS: insecure,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 10000,
    logger: false,
    debug: false,
    tls: { rejectUnauthorized: true },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(message: OutgoingEmail) {
      try {
        const result = await client.sendMail({
          from: { name: 'AI QAVER', address: from },
          to: message.recipient,
          subject: message.subject,
          text: message.text,
          html: message.html,
          textEncoding: 'base64',
          messageId: `<${message.messageKey}@${from.split('@')[1]}>`,
        });
        if (!result.accepted?.length || result.rejected?.length)
          throw new EmailTransportError('REJECTED');
      } catch (error) {
        throw error instanceof EmailTransportError ? error : cleanError(error);
      }
    },
  };
}
