#!/usr/bin/env tsx
/**
 * Test database connection directly
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as pg from 'pg';

// Parse .env.local
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  }
});

const DATABASE_URL = envVars.DATABASE_URL;

console.log('🔍 Testing Database Connection\n');
console.log(`DATABASE_URL: ${DATABASE_URL}`);
console.log('');

// Parse the connection string
const url = new URL(DATABASE_URL);
console.log('Parsed connection details:');
console.log(`  Host: ${url.hostname}`);
console.log(`  Port: ${url.port}`);
console.log(`  Database: ${url.pathname.slice(1)}`);
console.log(`  Username: ${url.username}`);
console.log(`  Password: ${url.password ? '***' + url.password.slice(-4) : 'EMPTY'}`);
console.log('');

// Test direct pg connection
const pool = new pg.Pool({
  host: url.hostname,
  port: parseInt(url.port),
  database: url.pathname.slice(1),
  user: url.username,
  password: url.password,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Connection successful!');
    console.log(`   Server time: ${result.rows[0].now}`);
    client.release();

    // Test signal count
    const signalResult = await client.query('SELECT COUNT(*) FROM "Signal"');
    console.log(`   Total signals: ${signalResult.rows[0].count}`);

    // Test signal status distribution
    const statusResult = await client.query(`
      SELECT status, COUNT(*) as count
      FROM "Signal"
      GROUP BY status
      ORDER BY count DESC
    `);
    console.log('\n📈 Signal Status Distribution:');
    statusResult.rows.forEach((row) => {
      console.log(`   ${row.status}: ${row.count}`);
    });

    await pool.end();
  } catch (error) {
    console.error('❌ Connection failed:', error);
    await pool.end();
    process.exit(1);
  }
}

testConnection();
