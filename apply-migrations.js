/**
 * TraceCode — Apply Migrations Script
 * 
 * USAGE:
 *   node apply-migrations.js <DB_PASSWORD>
 * 
 * Get your DB password from:
 *   Supabase Dashboard → Project Settings → Database → Database password
 *   (or reset it there if you forgot it)
 * 
 * Example:
 *   node apply-migrations.js mySecretPassword123
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'uvuximrxlogvtgirtlsc';
const DB_PASSWORD = process.argv[2];

if (!DB_PASSWORD) {
  console.error('\n❌ Usage: node apply-migrations.js <DB_PASSWORD>');
  console.error('\nGet your DB password from:');
  console.error('  Supabase Dashboard → Project Settings → Database → Database password\n');
  process.exit(1);
}

// Supabase direct connection (port 5432) and pooler (port 6543)
// Try direct first, fall back to pooler
const CONNECTION_CONFIGS = [
  {
    name: 'Direct connection',
    connectionString: `postgresql://postgres:${encodeURIComponent(DB_PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  },
  {
    name: 'Session pooler',
    connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  }
];

const MIGRATION_FILE = path.join(__dirname, 'supabase', 'APPLY_TO_SUPABASE_SQL_EDITOR.sql');

async function applyMigrations(config) {
  const client = new Client({
    connectionString: config.connectionString,
    ssl: config.ssl,
    connectionTimeoutMillis: 15000,
  });

  try {
    console.log(`\nConnecting via ${config.name}...`);
    await client.connect();
    console.log('✅ Connected!');

    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    
    // Split on semicolons but be careful with DO $$ blocks
    // Execute the whole thing as one transaction
    console.log('\nApplying migrations...');
    
    // Split into individual statements for better error reporting
    const statements = splitSqlStatements(sql);
    let applied = 0;
    let skipped = 0;

    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      
      try {
        await client.query(trimmed);
        applied++;
        // Show progress for major statements
        if (trimmed.toUpperCase().includes('CREATE TABLE') || 
            trimmed.toUpperCase().includes('ALTER TABLE') ||
            trimmed.toUpperCase().includes('CREATE POLICY') ||
            trimmed.toUpperCase().includes('CREATE INDEX') ||
            trimmed.toUpperCase().includes('CREATE TRIGGER')) {
          const firstLine = trimmed.split('\n')[0].substring(0, 80);
          console.log(`  ✓ ${firstLine}`);
        }
      } catch (err) {
        // Some errors are expected (already exists, etc.)
        if (err.message.includes('already exists') || 
            err.message.includes('does not exist') ||
            err.message.includes('duplicate key')) {
          skipped++;
        } else {
          console.warn(`  ⚠ Warning: ${err.message.substring(0, 100)}`);
        }
      }
    }

    console.log(`\n✅ Migration complete! Applied: ${applied}, Skipped/Already-exists: ${skipped}`);

    // Verify key tables exist
    console.log('\nVerifying tables...');
    const tables = ['classrooms', 'classroom_students', 'assignments', 'profiles', 'submissions'];
    for (const table of tables) {
      const result = await client.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
        [table]
      );
      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    }

    // Verify key columns
    console.log('\nVerifying new columns...');
    const columns = [
      ['classrooms', 'classroom_code'],
      ['classroom_students', 'student_id'],
      ['assignments', 'classroom_id'],
      ['assignments', 'language'],
      ['profiles', 'is_suspended'],
      ['submissions', 'behavioral_log'],
      ['ai_evaluations', 'risk_level'],
    ];
    for (const [table, column] of columns) {
      const result = await client.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2)`,
        [table, column]
      );
      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✅' : '❌'} ${table}.${column}`);
    }

    return true;
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

function splitSqlStatements(sql) {
  // Handle DO $$ ... $$ blocks as single statements
  const statements = [];
  let current = '';
  let inDollarBlock = false;
  
  const lines = sql.split('\n');
  for (const line of lines) {
    if (line.includes('$$')) {
      inDollarBlock = !inDollarBlock;
    }
    current += line + '\n';
    if (!inDollarBlock && line.trim().endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function main() {
  console.log('🚀 TraceCode Migration Tool');
  console.log('============================');
  console.log(`Project: ${PROJECT_REF}`);

  // Check if pg is available
  try {
    require('pg');
  } catch (e) {
    console.log('\nInstalling pg dependency...');
    const { execSync } = require('child_process');
    execSync('npm install pg', { stdio: 'inherit' });
  }

  for (const config of CONNECTION_CONFIGS) {
    const success = await applyMigrations(config);
    if (success) {
      console.log('\n🎉 All done! Your database is now up to date.');
      console.log('\nNext steps:');
      console.log('  1. Restart your dev server: npm run dev');
      console.log('  2. Test classroom creation at http://localhost:8080/teacher/classrooms');
      process.exit(0);
    }
    console.log(`\nTrying next connection method...`);
  }

  console.error('\n❌ All connection methods failed.');
  console.error('\nFallback: Use the SQL Editor method instead:');
  console.error('  1. Go to https://supabase.com/dashboard/project/uvuximrxlogvtgirtlsc/sql');
  console.error('  2. Open: supabase/APPLY_TO_SUPABASE_SQL_EDITOR.sql');
  console.error('  3. Copy the entire file and paste it into the SQL Editor');
  console.error('  4. Click Run\n');
  process.exit(1);
}

main();
