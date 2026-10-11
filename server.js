// Daily Planning Assistant — V1 local server (Phase 4: auth + sessions + schedule).
// Run: npm start  →  http://localhost:3000
require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");

const users = require("./routes/users");
const sessions = require("./routes/sessions");
const activities = require("./routes/activities");
const plans = require("./routes/plans");
const review = require("./routes/review");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Local V1: prefer SESSION_SECRET from the environment; otherwise use a random
// per-boot secret (sessions reset on restart) so no secret ships in the repo.
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.log("Note: SESSION_SECRET not set — using a random per-boot secret (sign-ins reset on restart).");
}
const SQLiteStore = require("./lib/session-store");
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore(require("./db/db")),
  })
);

// NOTE: "/history/all" has two path segments so it never collides with "/:id".
app.use("/api/users", users);
app.use("/api/sessions", sessions);
app.use("/api", activities);
app.use("/api", plans);
app.use("/api", review);
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Daily Planning Assistant running at http://localhost:${PORT}`);
});
