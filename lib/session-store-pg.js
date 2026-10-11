// Postgres-backed session store for express-session (hosted runs).
const session = require("express-session");
const pg = require("../db/store-pg");

module.exports = new (class extends session.Store {
  async get(sid, cb) {
    try {
      await pg.ensureSchema();
      const rows = await pg.client()`SELECT sess, expire FROM sessions WHERE sid = ${sid}`;
      const row = rows[0];
      if (!row || Number(row.expire) <= Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }
  async _set(sid, sess, cb) {
    try {
      const expire = (sess.cookie && sess.cookie.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 24 * 60 * 60 * 1000);
      await pg.ensureSchema();
      await pg.client()`INSERT INTO sessions (sid, sess, expire)
        VALUES (${sid}, ${JSON.stringify(sess)}, ${expire})
        ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`;
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  set(sid, sess, cb) {
    this._set(sid, sess, cb);
  }
  async destroy(sid, cb) {
    try {
      await pg.ensureSchema();
      await pg.client()`DELETE FROM sessions WHERE sid = ${sid}`;
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
  touch(sid, sess, cb) {
    this._set(sid, sess, cb);
  }
})();
