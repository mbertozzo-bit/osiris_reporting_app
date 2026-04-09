import { initializeDatabase } from './database';

async function runMigrations() {
  try {
    console.log('Starting database migrations...');
    
    await initializeDatabase();
    
    console.log('Database migrations completed successfully!');
    console.log('\nDatabase schema created:');
    console.log('- monthly_reports (consolidated report data)');
    console.log('- agents (agent contact information)');
    console.log('- agent_comments (per-agent monthly comments)');
    console.log('- email_history (email sending logs)');
    console.log('- email_delivery_reports (detailed email tracking)');
    console.log('- backup_logs (backup history)');
    console.log('- audit_logs (user action tracking)');
    console.log('- file_uploads (file processing history)');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();