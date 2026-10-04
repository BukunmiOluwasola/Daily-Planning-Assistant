// Single SQLite connection for the local V1 app.
// The database file lives next to the server and is git-ignored (see .gitignore).
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "daily-planner.db");
const SCHEMA_PATH = path.join(__dirname, "..", "schema.sql");

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

// First boot: create tables from schema.sql if the file was just created.
const hasUsers = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
  .get();
if (!hasUsers) {
  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
}

module.exports = db;
