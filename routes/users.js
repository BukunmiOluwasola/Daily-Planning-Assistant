// Local email + password auth (bcrypt + server-side sessions). V1 only.
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/db");

const router = express.Router();
const now = () => new Date().toISOString();

router.post("/signup", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required." });
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return res.status(409).json({ error: "Account already exists." });
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?,?,?)")
    .run(email, hash, now());
  req.session.userId = info.lastInsertRowid;
  res.status(201).json({ id: info.lastInsertRowid, email });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required." });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, email: user.email });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not signed in." });
  const user = db
    .prepare("SELECT id, email, productive_period FROM users WHERE id = ?")
    .get(req.session.userId);
  if (!user) return res.status(401).json({ error: "Not signed in." });
  res.json(user);
});

module.exports = router;
