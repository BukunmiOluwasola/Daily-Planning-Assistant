// Daily Planning Assistant — V1 local server (Phase 4: auth + sessions + schedule).
// Run: npm start  →  http://localhost:3000
require("dotenv").config();
const path = require("path");
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
app.use(
  session({
    secret: "daily-planning-local-dev-secret",
    resave: false,
    saveUninitialized: false,
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
