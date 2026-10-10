// A tiny stand-in for Cloudflare D1 backed by better-sqlite3, so the tests run in plain Node.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

class Stmt {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Stmt(this.db, this.sql, args);
  }
  get #s() {
    return this.db.prepare(this.sql);
  }
  async first(col) {
    const s = this.#s;
    const row = s.reader ? s.get(...this.args) : (s.run(...this.args), undefined);
    if (!row) return null;
    return col ? row[col] : row;
  }
  async all() {
    const s = this.#s;
    if (!s.reader) return this.run();
    return { results: s.all(...this.args), success: true, meta: {} };
  }
  async run() {
    const s = this.#s;
    if (s.reader) return { results: s.all(...this.args), success: true, meta: {} };
    const info = s.run(...this.args);
    return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes } };
  }
  runSync() {
    const s = this.#s;
    return s.reader ? s.all(...this.args) : s.run(...this.args);
  }
}

export function createD1() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const dir = path.join(import.meta.dirname, '..', 'migrations');
  for (const f of fs.readdirSync(dir).sort()) db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      return db.transaction(() => stmts.map((s) => s.runSync()))();
    },
    async exec(sql) {
      db.exec(sql);
    },
  };
}
