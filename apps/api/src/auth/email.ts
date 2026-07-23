import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const logger = new Logger('Email');

/**
 * Sends the magic-link email. In development (no SMTP configured) it logs the link to the console
 * so you can sign in without a mail server — the whole point of a fast, local-first setup.
 */
export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  if (!env.smtp) {
    logger.log(`\n🔗 Magic link for ${email}:\n${url}\n`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.password },
  });

  await transporter.sendMail({
    from: env.smtp.from,
    to: email,
    subject: 'Your Bleachers sign-in link',
    text: `Sign in to Bleachers:\n${url}\n\nThis link expires in 10 minutes.`,
    html: `<p>Sign in to Bleachers:</p><p><a href="${url}">Sign in</a></p><p>This link expires in 10 minutes.</p>`,
  });
}
