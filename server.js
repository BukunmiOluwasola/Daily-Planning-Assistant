// Daily Planning Assistant — V1 local server.
// Run: npm start  →  http://localhost:3000
require("dotenv").config();
const crypto = require("crypto");
const session = require("express-session");
const { makeApp } = require("./express-app");
const SQLiteStore = require("./lib/session-store");

const PORT = process.env.PORT || 3000;

// Local V1: prefer SESSION_SECRET from the environment; otherwise use a random
// per-boot secret (sessions reset on restart) so no secret ships in the repo.
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.log("Note: SESSION_SECRET not set — using a random per-boot secret (sign-ins reset on restart).");
}

const app = makeApp(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore(require("./db/db")),
  })
);

app.listen(PORT, () => {
  console.log(`Daily Planning Assistant running at http://localhost:${PORT}`);
});
