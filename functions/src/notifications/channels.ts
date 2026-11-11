/**
 * Outbound channel adapters. Each provider is selected by configuration and can be swapped
 * without touching business logic. Without credentials the "log" adapter records the message
 * in the function logs so development flows keep working.
 */
import { logger } from 'firebase-functions/v2';
import { getSecret } from '../lib/secrets';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export interface EmailProvider {
  id: string;
  send(msg: EmailMessage): Promise<void>;
}

export interface SmsProvider {
  id: string;
  send(msg: SmsMessage): Promise<void>;
}

const logEmail: EmailProvider = {
  id: 'log',
  async send(msg) {
    logger.info('[email:log]', { to: msg.to, subject: msg.subject, text: msg.text });
  },
};

const logSms: SmsProvider = {
  id: 'log',
  async send(msg) {
    logger.info('[sms:log]', { to: msg.to, body: msg.body });
  },
};

function sendgrid(apiKey: string, from: string): EmailProvider {
  return {
    id: 'sendgrid',
    async send(msg) {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: msg.to }] }],
          from: { email: from, name: 'CourtSync' },
          subject: msg.subject,
          content: [
            { type: 'text/plain', value: msg.text },
            ...(msg.html ? [{ type: 'text/html', value: msg.html }] : []),
          ],
        }),
      });
      if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    },
  };
}

function twilio(sid: string, token: string, from: string): SmsProvider {
  return {
    id: 'twilio',
    async send(msg) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: msg.to, From: from, Body: msg.body }),
      });
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    },
  };
}

export async function emailProvider(): Promise<EmailProvider> {
  const key = await getSecret('SENDGRID_API_KEY');
  const from = process.env.EMAIL_FROM;
  return key && from ? sendgrid(key, from) : logEmail;
}

export async function smsProvider(): Promise<SmsProvider> {
  const [sid, token] = await Promise.all([getSecret('TWILIO_ACCOUNT_SID'), getSecret('TWILIO_AUTH_TOKEN')]);
  const from = process.env.TWILIO_FROM_NUMBER;
  return sid && token && from ? twilio(sid, token, from) : logSms;
}

export async function emailConfigured(): Promise<boolean> {
  return (await emailProvider()).id !== 'log';
}
