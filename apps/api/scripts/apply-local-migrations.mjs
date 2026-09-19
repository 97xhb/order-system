import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const { Client } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(
  scriptDirectory,
  '../prisma/migrations',
);

const migrationTableSql = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);
`;

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function migrationDirectories() {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('本机数据库地址未配置');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(migrationTableSql);
    const appliedResult = await client.query(
      'SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.migration_name, row.checksum]),
    );

    for (const migrationName of await migrationDirectories()) {
      const migrationPath = path.join(
        migrationsDirectory,
        migrationName,
        'migration.sql',
      );
      const sql = await readFile(migrationPath);
      const currentChecksum = checksum(sql);
      const existingChecksum = applied.get(migrationName);

      if (existingChecksum) {
        if (existingChecksum !== currentChecksum) {
          throw new Error(`迁移文件已被修改：${migrationName}`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql.toString('utf8'));
        const appliedAt = new Date();
        await client.query(
          `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
           VALUES ($1, $2, $3, $4, NULL, NULL, $3, 1)`,
          [randomUUID(), currentChecksum, appliedAt, migrationName],
        );
        await client.query('COMMIT');
        console.log(`已应用本机迁移：${migrationName}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('本机数据库结构已是最新状态');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
