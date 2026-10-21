import "server-only";

import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export type EmailTemplate = {
  preheader?: string;
  eyebrow?: string;
  title: string;
  greeting?: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  note?: string;
};

type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  template?: EmailTemplate;
};

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function safeActionUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function inferAction(subject: string, text: string): { url: string; label: string } | undefined {
  const candidate = text.match(/https?:\/\/[^\s<>"']+/)?.[0]?.replace(/[),.;!?]+$/, "");
  if (!candidate || !safeActionUrl(candidate)) return undefined;
  const lower = subject.toLowerCase();
  const label = lower.includes("verif") ? "Verify email address"
    : lower.includes("password") || lower.includes("reset") ? "Reset password"
      : lower.includes("invitation") || lower.includes("invited") ? "Review invitation"
        : "Open Property Connect";
  return { url: candidate, label };
}

function defaultTemplate(subject: string, text: string): EmailTemplate {
  const action = inferAction(subject, text);
  const body = action ? text.replace(action.url, "").trim() : text.trim();
  return {
    preheader: subject,
    eyebrow: "PROPERTY CONNECT ZIMBABWE",
    title: subject,
    paragraphs: body ? body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean) : [],
    action,
  };
}

function paragraphHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function renderHtmlEmail(template: EmailTemplate): string {
  const preheader = escapeHtml(template.preheader ?? template.title);
  const eyebrow = escapeHtml(template.eyebrow ?? "PROPERTY CONNECT ZIMBABWE");
  const title = escapeHtml(template.title);
  const greeting = template.greeting ? `<p style="margin:0 0 18px;color:#172234;font:600 15px/1.6 Arial,Helvetica,sans-serif">${escapeHtml(template.greeting)}</p>` : "";
  const paragraphs = template.paragraphs.map((paragraph) => `<p style="margin:0 0 16px;color:#465267;font:14px/1.75 Arial,Helvetica,sans-serif">${paragraphHtml(paragraph)}</p>`).join("");
  const href = template.action ? safeActionUrl(template.action.url) : undefined;
  const action = href ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 22px"><tr><td bgcolor="#0b3b8f" style="border:1px solid #0b3b8f"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font:600 13px/1.2 Arial,Helvetica,sans-serif">${escapeHtml(template.action?.label ?? "Continue securely")}</a></td></tr></table>` : "";
  const note = template.note ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #e0e4eb;color:#667085;font:12px/1.65 Arial,Helvetica,sans-serif">${paragraphHtml(template.note)}</p>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title></head><body style="margin:0;padding:0;background:#f2f4f7;color:#0a1424;-webkit-text-size-adjust:100%"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f4f7"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px"><tr><td style="height:5px;background:#1e5fbf;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="padding:18px 22px;background:#ffffff;border-left:1px solid #d9dde5;border-right:1px solid #d9dde5"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="42" valign="middle"><div style="width:34px;height:34px;border:1px solid #c3c6cc;text-align:center;color:#0a1424;font:700 10px/34px Arial,Helvetica,sans-serif">PCZ</div></td><td valign="middle" style="padding-left:11px;color:#0a1424;font:700 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.5px">PROPERTY CONNECT<br><span style="color:#667085;font:10px/1.5 Arial,Helvetica,sans-serif;letter-spacing:1.2px">ZIMBABWE</span></td></tr></table></td></tr><tr><td style="padding:30px 22px 32px;background:#ffffff;border:1px solid #d9dde5;border-top:0"><p style="margin:0 0 10px;color:#667085;font:10px/1.5 'Courier New',monospace;letter-spacing:1.4px;text-transform:uppercase">${eyebrow}</p><h1 style="margin:0 0 22px;color:#0a1424;font:600 25px/1.3 Arial,Helvetica,sans-serif;letter-spacing:-.3px">${title}</h1>${greeting}${paragraphs}${action}${note}</td></tr><tr><td style="padding:18px 8px 0;color:#667085;font:11px/1.7 Arial,Helvetica,sans-serif"><strong style="color:#344054">Property Connect Zimbabwe</strong><br>Verified agents. Documented listings. Direct enquiries.<br><span style="color:#7e858f">If you weren’t expecting this email, you can safely ignore it.</span></td></tr></table></td></tr></table></body></html>`;
}

export async function sendEmail(message: OutgoingEmail, options: { required?: boolean } = {}): Promise<void> {
  if (!env.smtpHost) {
    if (options.required || env.isProduction) throw new Error("SMTP is not configured");
    console.info("Transactional email skipped because SMTP is not configured.");
    return;
  }

  const transport = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });

  await transport.sendMail({
    from: env.smtpFrom,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: renderHtmlEmail(message.template ?? defaultTemplate(message.subject, message.text)),
  });
}
