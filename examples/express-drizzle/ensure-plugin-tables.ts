import Database from 'better-sqlite3';

const dbPath = (process.env.DB_FILE_NAME || 'file:./dev.db').replace(/^file:/, '');

const db = new Database(dbPath);

async function main() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_triggers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      webhook_path TEXT NOT NULL UNIQUE,
      webhook_secret TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'generic',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      allowed_methods TEXT NOT NULL DEFAULT 'POST',
      flow_id TEXT,
      node_id TEXT,
      last_triggered_at TEXT,
      last_payload TEXT,
      trigger_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE NO ACTION
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rbac_teams (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rbac_team_members (
      id TEXT PRIMARY KEY NOT NULL,
      team_id TEXT NOT NULL REFERENCES rbac_teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rbac_team_members_team_id ON rbac_team_members(team_id);`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rbac_team_members_user_id ON rbac_team_members(user_id);`,
  );

  console.log('Ensured plugin tables exist in SQLite database');
}

main()
  .catch((error) => {
    console.error('Failed to ensure plugin tables', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    db.close();
  });
