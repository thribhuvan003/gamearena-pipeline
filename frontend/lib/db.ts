// db.ts: the single connection to CockroachDB, with the same settings and defaults as the pipeline.

import { connection } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 26257),
  database: process.env.DB_NAME ?? "gamearena_analytics",
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD,
});

export async function query<Row>(sql: string, params: unknown[] = []): Promise<Row[]> {   // Runs one SELECT with $1, $2 parameters and returns its rows. Called by every function in queries.ts; connection() makes it run on each page load, so the numbers are always live
  await connection();
  const result = await pool.query(sql, params);
  return result.rows as Row[];
}
