// SQLite-backed session store for express-session (no new dependencies).
// Sessions survive server restarts; rows expire automatically on read.
const session = require("express-session");

class SQLiteStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    db.exec(
      "CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire INTEGER NOT NULL)"
    );
    this.getStmt = db.prepare("SELECT sess, expire FROM sessions WHERE sid = ?");
    this.setStmt = db.prepare(
      "INSERT INTO sessions (sid, sess, expire) VALUES (?,?,?) " +
        "ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire"
    );
    this.delStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
  }
  _expired(row) {
    return !row || row.expire <= Date.now();
  }
  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (this._expired(row)) {
        if (row) this.delStmt.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }
  set(sid, sess, cb) {
    try {
      const expire = (sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 24 * 60 * 60 * 1000);
      this.setStmt.run(sid, JSON.stringify(sess), expire);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  destroy(sid, cb) {
    try {
      this.delStmt.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }
}

module.exports = SQLiteStore;
