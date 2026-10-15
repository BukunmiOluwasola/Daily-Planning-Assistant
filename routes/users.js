// Local email + password auth (bcrypt + server-side sessions). V1 only.
// Storage-agnostic: works on SQLite locally and Blobs on Netlify.
const express = require("express");
const bcrypt = require("bcryptjs");
const store = require("../db");

const router = express.Router();
const now = () => new Date().toISOString();

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password required." });
    if (await store.findUserByEmail(email)) {
      return res.status(409).json({ error: "Account already exists." });
    }
    const id = await store.createUser(email, bcrypt.hashSync(password, 10), now());
    req.session.userId = id;
    res.status(201).json({ id, email });
  } catch (err) {
    res.status(500).json({ error: "Sign-up failed." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password required." });
    const user = await store.findUserByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    res.status(500).json({ error: "Sign-in failed." });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
    const user = await store.findUserById(req.session.userId);
    if (!user) return res.status(401).json({ error: "Not signed in." });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

// ---- Password recovery (email links) ----
// Responses are generic: they never reveal whether an account exists.
// Email is only sent when an SMTP provider is configured; otherwise the
// caller gets an honest 503 and nothing is claimed.
const crypto = require("crypto");
const mailer = require("../lib/mailer");

const RESET_TTL_MS = 60 * 60 * 1000;
const resetAttempts = new Map(); // key -> { count, resetAt }
function throttled(key, limit, windowMs) {
  const nowMs = Date.now();
  let rec = resetAttempts.get(key);
  if (!rec || rec.resetAt <= nowMs) {
    rec = { count: 0, resetAt: nowMs + windowMs };
    resetAttempts.set(key, rec);
  }
  rec.count += 1;
  return rec.count > limit;
}
function baseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0];
  return `${proto}://${req.get("host")}`;
}

router.post("/reset-request", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email is required." });
    const ip = req.ip || "unknown";
    if (throttled(`ip:${ip}`, 30, RESET_TTL_MS) || throttled(`email:${String(email).toLowerCase()}`, 5, RESET_TTL_MS)) {
      return res.status(429).json({ error: "Too many attempts. Please try again later." });
    }
    await store.deleteExpiredResets(Date.now());
    const user = await store.findUserByEmail(email);
    // Generic response in all cases — existence stays hidden.
    if (!user || !mailer.configured()) {
      return res.json({ ok: true });
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await store.createResetToken(user.id, hash, Date.now() + RESET_TTL_MS, now());
    await mailer.sendResetEmail(user.email, `${baseUrl(req)}/?reset=${token}`);
    return res.json({ ok: true });
  } catch (err) {
    if (err && err.code === "MAIL_UNCONFIGURED") {
      return res.status(503).json({ error: "Email delivery is not configured yet." });
    }
    res.status(500).json({ error: "Request failed." });
  }
});

router.post("/reset", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: "Reset link and new password are required." });
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    const hash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const rec = await store.findResetTokenByHash(hash);
    // One generic message for missing, used, or expired links — no oracle.
    if (!rec || rec.used_at || rec.expires_at <= Date.now()) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }
    await store.updateUserPassword(rec.user_id, bcrypt.hashSync(String(password), 10));
    await store.markResetUsed(rec.id, now());
    await store.deleteUserResetTokens(rec.user_id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Request failed." });
  }
});

module.exports = router;
