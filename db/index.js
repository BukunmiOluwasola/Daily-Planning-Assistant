// Store selector. Local runs use SQLite; Netlify (or STORE=blobs) uses Blobs.
// better-sqlite3 is required lazily so the Lambda bundle (which lists it in
// netlify.toml `external_node_modules`) never loads the native binding.
const NAMES = [
  "findUserByEmail", "findUserById", "createUser", "updateUserPassword", "updateUserSettings", "listSessions", "createSession",
  "getSession", "setPreference", "historyCounts", "listActivities", "maxPosition",
  "insertActivity", "getActivityInSession", "getActivityOwnedBy", "getActivityById",
  "updateActivity", "deleteActivity", "getPlanBySession", "createPlan", "clearPlanItems",
  "addPlanItem", "listPlanItems", "getPlanItemOwned", "updatePlanItem", "getPlanItemById",
  "createFocus", "getFocusOwned", "endFocus", "getFocusById", "reviewCounts",
  "unfinishedInSession", "markCarried", "latestOpenFocus", "focusMinutesBySession",
  "findOrCreateSessionByDate", "findSessionByDate", "setSessionStart", "bulkInsertActivities",
  "createResetToken", "findResetTokenByHash", "markResetUsed", "deleteUserResetTokens", "deleteExpiredResets",
];

let impl = null;
function backend() {
  if (!impl) {
    impl = (process.env.STORE === "pg" || process.env.DATABASE_URL)
      ? require("./store-pg")
      : require("./store-sqlite");
  }
  return impl;
}

for (const name of NAMES) {
  module.exports[name] = (...args) => backend()[name](...args);
}
module.exports.backendName = () => {
  if (process.env.STORE === "pg" || process.env.DATABASE_URL) return "pg";
  return "sqlite";
};
