import fs from 'fs';
import path from 'path';
import { db } from '../../database/database';
import logger from '../../utils/logger';

export class BackupService {
  private backupPath: string;
  private retentionDays: number;

  constructor() {
    this.backupPath = process.env.BACKUP_PATH || './backups';
    this.retentionDays = 30; // Keep backups for 30 days
    this.ensureBackupDirectory();
  }

  private ensureBackupDirectory(): void {
    if (!fs.existsSync(this.backupPath)) {
      fs.mkdirSync(this.backupPath, { recursive: true });
      logger.info(`Created backup directory: ${this.backupPath}`);
    }
  }

  public async createBackup(): Promise<{ success: boolean; backupFile?: string; error?: string }> {
    try {
      const dbPath = process.env.DATABASE_PATH || './data/osiris.db';
      
      if (!fs.existsSync(dbPath)) {
        throw new Error(`Database file not found: ${dbPath}`);
      }
      
      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `osiris_backup_${timestamp}.db`;
      const backupFilePath = path.join(this.backupPath, backupFileName);
      
      // Copy database file
      fs.copyFileSync(dbPath, backupFilePath);
      
      // Get backup size
      const stats = fs.statSync(backupFilePath);
      const sizeBytes = stats.size;
      
      // Log backup in database
      await db.run(
        'INSERT INTO backup_logs (backup_file, size_bytes) VALUES (?, ?)',
        [backupFileName, sizeBytes]
      );
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      logger.info(`Backup created: ${backupFileName} (${this.formatFileSize(sizeBytes)})`);
      
      return {
        success: true,
        backupFile: backupFileName
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Backup creation failed:', error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  public async restoreBackup(backupFileName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const backupFilePath = path.join(this.backupPath, backupFileName);
      
      if (!fs.existsSync(backupFilePath)) {
        throw new Error(`Backup file not found: ${backupFileName}`);
      }
      
      const dbPath = process.env.DATABASE_PATH || './data/osiris.db';
      const dbDir = path.dirname(dbPath);
      
      // Ensure database directory exists
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Close current database connection
      await db.close();
      
      // Copy backup to database location
      fs.copyFileSync(backupFilePath, dbPath);
      
      // Reinitialize database
      const { initializeDatabase } = await import('../../database/database');
      await initializeDatabase();
      
      logger.info(`Backup restored: ${backupFileName}`);
      
      return {
        success: true
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Backup restoration failed:', error);
      
      // Try to reinitialize database on failure
      try {
        const { initializeDatabase } = await import('../../database/database');
        await initializeDatabase();
      } catch (reinitError) {
        logger.error('Failed to reinitialize database after restore failure:', reinitError);
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  public async listBackups(): Promise<Array<{
    filename: string;
    size: number;
    created: Date;
    formattedSize: string;
    formattedDate: string;
  }>> {
    try {
      if (!fs.existsSync(this.backupPath)) {
        return [];
      }
      
      const files = fs.readdirSync(this.backupPath)
        .filter(file => file.startsWith('osiris_backup_') && file.endsWith('.db'))
        .map(filename => {
          const filePath = path.join(this.backupPath, filename);
          const stats = fs.statSync(filePath);
          
          return {
            filename,
            size: stats.size,
            created: stats.birthtime,
            formattedSize: this.formatFileSize(stats.size),
            formattedDate: stats.birthtime.toLocaleString()
          };
        })
        .sort((a, b) => b.created.getTime() - a.created.getTime()); // Newest first
      
      return files;
    } catch (error) {
      logger.error('Failed to list backups:', error);
      return [];
    }
  }

  public async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    formattedTotalSize: string;
    oldestBackup?: Date;
    newestBackup?: Date;
    backupsByDay: Array<{ date: string; count: number; totalSize: number }>;
  }> {
    try {
      const backups = await this.listBackups();
      
      if (backups.length === 0) {
        return {
          totalBackups: 0,
          totalSize: 0,
          formattedTotalSize: '0 B',
          backupsByDay: []
        };
      }
      
      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      const oldestBackup = backups[backups.length - 1].created;
      const newestBackup = backups[0].created;
      
      // Group backups by day
      const backupsByDayMap = new Map<string, { count: number; totalSize: number }>();
      
      backups.forEach(backup => {
        const dateKey = backup.created.toISOString().split('T')[0]; // YYYY-MM-DD
        const dayStats = backupsByDayMap.get(dateKey) || { count: 0, totalSize: 0 };
        dayStats.count++;
        dayStats.totalSize += backup.size;
        backupsByDayMap.set(dateKey, dayStats);
      });
      
      const backupsByDay = Array.from(backupsByDayMap.entries())
        .map(([date, stats]) => ({
          date,
          count: stats.count,
          totalSize: stats.totalSize
        }))
        .sort((a, b) => b.date.localeCompare(a.date)); // Newest first
      
      return {
        totalBackups: backups.length,
        totalSize,
        formattedTotalSize: this.formatFileSize(totalSize),
        oldestBackup,
        newestBackup,
        backupsByDay
      };
    } catch (error) {
      logger.error('Failed to get backup stats:', error);
      return {
        totalBackups: 0,
        totalSize: 0,
        formattedTotalSize: '0 B',
        backupsByDay: []
      };
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      let deletedCount = 0;
      let deletedSize = 0;
      
      for (const backup of backups) {
        if (backup.created < cutoffDate) {
          const backupPath = path.join(this.backupPath, backup.filename);
          fs.unlinkSync(backupPath);
          deletedCount++;
          deletedSize += backup.size;
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old backups (${this.formatFileSize(deletedSize)})`);
      }
    } catch (error) {
      logger.error('Failed to clean up old backups:', error);
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  public async scheduleDailyBackup(): Promise<void> {
    // This would be called by a scheduler (cron job)
    try {
      const result = await this.createBackup();
      
      if (result.success) {
        logger.info('Scheduled daily backup completed successfully');
      } else {
        logger.error('Scheduled daily backup failed:', result.error);
      }
    } catch (error) {
      logger.error('Scheduled backup error:', error);
    }
  }

  public async verifyBackup(backupFileName: string): Promise<{ 
    success: boolean; 
    error?: string;
    details?: {
      size: number;
      created: Date;
      isValid: boolean;
    }
  }> {
    try {
      const backupFilePath = path.join(this.backupPath, backupFileName);
      
      if (!fs.existsSync(backupFilePath)) {
        return {
          success: false,
          error: 'Backup file not found'
        };
      }
      
      const stats = fs.statSync(backupFilePath);
      
      // Basic validation: check file size and extension
      const isValid = stats.size > 0 && backupFileName.endsWith('.db');
      
      return {
        success: true,
        details: {
          size: stats.size,
          created: stats.birthtime,
          isValid
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }
}