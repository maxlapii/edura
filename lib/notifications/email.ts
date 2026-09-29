import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/** Console transport used in development/tests: logs instead of sending. */
export class ConsoleEmailTransport implements EmailTransport {
  public readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
    if (process.env.NODE_ENV !== "test") {
      console.log(`[email] to=${message.to} subject="${message.subject}"`);
    }
  }
}

class SmtpEmailTransport implements EmailTransport {
  private transporter: Transporter;
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  async send(message: EmailMessage) {
    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM ?? "Edura <no-reply@edura.local>",
      ...message,
    });
  }
}

let transport: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (!transport) {
    transport = process.env.SMTP_HOST ? new SmtpEmailTransport() : new ConsoleEmailTransport();
  }
  return transport;
}

/** Test hook: replace the transport. */
export function setEmailTransport(t: EmailTransport | null) {
  transport = t;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await getEmailTransport().send(message);
  } catch (err) {
    console.error("[email] failed to send", err);
  }
}
