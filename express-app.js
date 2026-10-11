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
