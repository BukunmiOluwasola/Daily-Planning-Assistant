// Store selector. Local runs use SQLite; Netlify (or STORE=blobs) uses Blobs.
// better-sqlite3 is required lazily so the Lambda bundle (which lists it in
// netlify.toml `external_node_modules`) never loads the native binding.
const NAMES = [
  "findUserByEmail", "findUserById", "createUser", "listSessions", "createSession",
  "getSession", "setPreference", "historyCounts", "listActivities", "maxPosition",
  "insertActivity", "getActivityInSession", "getActivityOwnedBy", "getActivityById",
  "updateActivity", "deleteActivity", "getPlanBySession", "createPlan", "clearPlanItems",
  "addPlanItem", "listPlanItems", "getPlanItemOwned", "updatePlanItem", "getPlanItemById",
  "createFocus", "getFocusOwned", "endFocus", "getFocusById", "reviewCounts",
  "unfinishedInSession", "markCarried", "latestOpenFocus",
];

let impl = null;
function backend() {
  if (!impl) {
    if (process.env.STORE === "pg" || process.env.DATABASE_URL) impl = require("./store-pg");
    else if (process.env.STORE === "blobs" || process.env.NETLIFY === "true") impl = require("./store-blobs");
    else impl = require("./store-sqlite");
  }
  return impl;
}

for (const name of NAMES) {
  module.exports[name] = (...args) => backend()[name](...args);
}
module.exports.backendName = () => {
  if (process.env.STORE === "pg" || process.env.DATABASE_URL) return "pg";
  if (process.env.STORE === "blobs" || process.env.NETLIFY === "true") return "blobs";
  return "sqlite";
};
