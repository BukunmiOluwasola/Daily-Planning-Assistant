// Netlify Function entry: same Express app + routes as local,
// backed by hosted Postgres (Neon) instead of the local SQLite file.
// Secrets (DATABASE_URL, GEMINI_API_KEY, SESSION_SECRET) come from
// Netlify environment variables — never from the repo.
const serverless = require("serverless-http");
const session = require("express-session");
const crypto = require("crypto");
const { makeApp } = require("../../express-app");
const pgSessionStore = require("../../lib/session-store-pg");

const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const app = makeApp(
  session({
    secret,
    resave: false,
    saveUninitialized: false,
    store: pgSessionStore,
  })
);

module.exports.handler = serverless(app);
