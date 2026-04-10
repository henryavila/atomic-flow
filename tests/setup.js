import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import initSqlJs from 'sql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', 'meta', 'schema.sql');

let SQL;

export async function createTestDb() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  const db = new SQL.Database();
  db.run(schema);
  return db;
}

export function seedFeature(db, name) {
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const branch = `atomic-flow/${slug}`;

  db.run(
    'INSERT INTO features (name, slug, branch) VALUES (?, ?, ?)',
    [name, slug, branch]
  );

  const [{ id }] = db.exec('SELECT last_insert_rowid() as id')[0].values.map(
    row => ({ id: row[0] })
  );

  const gates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
  for (const gate of gates) {
    db.run(
      'INSERT INTO gates (feature_id, gate) VALUES (?, ?)',
      [id, gate]
    );
  }

  return { id, slug, branch };
}
