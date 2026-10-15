// Shared Express app factory: identical routes locally and on Netlify.
// server.js adds the session store + listen (local); netlify/functions/api.js
// adds the Blobs session store + Lambda adapter.
const path = require("path");
const express = require("express");

const users = require("./routes/users");
const sessions = require("./routes/sessions");
const activities = require("./routes/activities");
const plans = require("./routes/plans");
const review = require("./routes/review");

function makeApp(sessionMiddleware) {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware);

  // Idle + absolute session lifetimes (single place, all backends/targets).
  // IDLE: sign out after 60 min without any request. ABSOLUTE: 12 h max
  // even if continuously active. Expired callers get 401 and re-sign in.
  const IDLE_MS = 60 * 60 * 1000;
  const ABS_MS = 12 * 60 * 60 * 1000;
  app.use((req, res, next) => {
    try {
      const s = req.session;
      if (!s || !s.userId) return next();
      const nowMs = Date.now();
      if (!s.createdAt) s.createdAt = nowMs;
      if (nowMs - s.createdAt > ABS_MS || (s.lastSeen && nowMs - s.lastSeen > IDLE_MS)) {
        return s.destroy(() => res.status(401).json({ error: "Session expired. Please sign in again." }));
      }
      s.lastSeen = nowMs;
      return next();
    } catch (err) {
      return next();
    }
  });

  // NOTE: "/history/all" has two path segments so it never collides with "/:id".
  app.use("/api/users", users);
  app.use("/api/sessions", sessions);
  app.use("/api", activities);
  app.use("/api", plans);
  app.use("/api", review);
  app.use(express.static(path.join(__dirname, "public")));
  return app;
}

module.exports = { makeApp };
