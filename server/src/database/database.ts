import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import type { Database } from '../types/database';
import path from 'path';
import fs from 'fs';

export let db: Database;

export async function initializeDatabase(): Promise<void> {
  try {
    const dbPath = process.env.DATABASE_PATH || './data/osiris.db';
    const dbDir = path.dirname(dbPath);
    
    // Ensure database directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Open database connection
    const sqliteDb = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Cast to our Database type
    db = sqliteDb as unknown as Database;
    
    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');
    
    // Run migrations
    await runMigrations();
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

async function runMigrations(): Promise<void> {
  // Create tables if they don't exist
  await db.exec(`
    -- Monthly reports consolidated data
    CREATE TABLE IF NOT EXISTS monthly_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
      year INTEGER NOT NULL CHECK (year >= 2020),
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      
      -- Agent Summary metrics
      total_handle_calls INTEGER,
      average_handle_time TEXT,
      agent_unavailable_time_hours DECIMAL(10,4),
      escalation_rate DECIMAL(5,2),
      call_quality_score DECIMAL(5,2),
      schedule_adherence DECIMAL(5,2),
      refused_calls DECIMAL(5,2),
      
      -- AUT breakdown (in seconds)
      arf_seconds INTEGER,
      correcting_repost_seconds INTEGER,
      edit_transfer_seconds INTEGER,
      emails_seconds INTEGER,
      faxes_seconds INTEGER,
      meeting_seconds INTEGER,
      misc_seconds INTEGER,
      payment_plan_seconds INTEGER,
      personal_seconds INTEGER,
      printing_log_seconds INTEGER,
      statements_seconds INTEGER,
      task_seconds INTEGER,
      technical_issue_seconds INTEGER,
      training_seconds INTEGER,
      vms_seconds INTEGER,
      wrap_up_seconds INTEGER,
      break_seconds INTEGER,
      lunch_seconds INTEGER,
      total_seconds INTEGER,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(month, year, agent_id)
    );

    -- Agent contact information (editable)
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Agent comments per month
    CREATE TABLE IF NOT EXISTS agent_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
      year INTEGER NOT NULL CHECK (year >= 2020),
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(agent_id),
      UNIQUE(agent_id, month, year)
    );

    -- Email sending history
    CREATE TABLE IF NOT EXISTS email_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
      year INTEGER NOT NULL CHECK (year >= 2020),
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
      error_message TEXT,
      message_id TEXT UNIQUE,
      FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
    );

    -- Email delivery reports (detailed tracking)
    CREATE TABLE IF NOT EXISTS email_delivery_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_history_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      message_id TEXT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'failed', 'opened')),
      status_details TEXT,
      opened_at TIMESTAMP,
      delivered_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (email_history_id) REFERENCES email_history(id),
      FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
    );

    -- Backup logs
    CREATE TABLE IF NOT EXISTS backup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_file TEXT NOT NULL,
      size_bytes INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Audit logs for user actions
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- File upload logs
    CREATE TABLE IF NOT EXISTS file_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
      year INTEGER NOT NULL CHECK (year >= 2020),
      size_bytes INTEGER,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
      error_message TEXT
    );
  `);
  
  // Create indexes for performance
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_monthly_reports_month_year ON monthly_reports(month, year);
    CREATE INDEX IF NOT EXISTS idx_monthly_reports_agent_id ON monthly_reports(agent_id);
    CREATE INDEX IF NOT EXISTS idx_email_history_agent_date ON email_history(agent_id, month, year);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_file_uploads_date ON file_uploads(month, year);
  `);
  
  console.log('Database migrations completed');
}
