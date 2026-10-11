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

module.exports = router;
