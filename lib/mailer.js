// Outbound email (password-reset links). No provider is configured by default.
// Configure SMTP via environment (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// SMTP_FROM); without SMTP_HOST the mailer reports unconfigured and callers
// must NOT claim an email was sent. TEST_MAILER=stream captures the message
// in-process for automated tests without delivering anything.
const nodemailer = require("nodemailer");

function configured() {
  return !!process.env.SMTP_HOST || process.env.TEST_MAILER === "stream";
}

let cached = null;
function transport() {
  if (!cached) {
    if (process.env.TEST_MAILER === "stream") {
      cached = nodemailer.createTransport({ streamTransport: true, newline: "unix", buffer: true });
    } else {
      cached = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "false") === "true",
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" } : undefined,
      });
    }
  }
  return cached;
}

async function sendResetEmail(to, link) {
  if (!process.env.SMTP_HOST && process.env.TEST_MAILER !== "stream") {
    const err = new Error("Email delivery is not configured.");
    err.code = "MAIL_UNCONFIGURED";
    throw err;
  }
  return transport().sendMail({
    from: process.env.SMTP_FROM || "Daily Planning Assistant <no-reply@localhost>",
    to,
    subject: "Reset your Daily Planning Assistant password",
    text: `Someone requested a password reset for this email address.\n\nReset your password here (valid 1 hour, one-time use):\n${link}\n\nIf you did not request this, ignore this email — your password is unchanged.`,
  });
}

module.exports = { configured, sendResetEmail };
