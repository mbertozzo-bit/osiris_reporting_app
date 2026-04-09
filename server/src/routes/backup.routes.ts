import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { BackupService } from '../services/backup/BackupService';

const router = express.Router();
const backupService = new BackupService();

// Create new backup
router.post(
  '/create',
  authenticate,
  async (_req: AuthRequest, res) => {
    try {
      const result = await backupService.createBackup();
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Backup created successfully',
          backupFile: result.backupFile
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Create backup error:', error);
      res.status(500).json({ 
        error: 'Failed to create backup',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// List all backups
router.get(
  '/list',
  authenticate,
  async (_req: AuthRequest, res) => {
    try {
      const backups = await backupService.listBackups();
      const stats = await backupService.getBackupStats();
      
      res.json({
        backups,
        stats
      });
    } catch (error) {
      console.error('List backups error:', error);
      res.status(500).json({ 
        error: 'Failed to list backups',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Restore from backup
router.post(
  '/restore/:backupFileName',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const { backupFileName } = req.params;
      const { confirm } = req.body;
      
      if (!confirm) {
        res.status(400).json({ 
          error: 'Confirmation required',
          message: 'Please confirm you want to restore from backup. This will overwrite current data.'
        });
        return;
      }
      
      const result = await backupService.restoreBackup(backupFileName);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Backup restored successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Restore backup error:', error);
      res.status(500).json({ 
        error: 'Failed to restore backup',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Get backup statistics
router.get(
  '/stats',
  authenticate,
  async (_req: AuthRequest, res) => {
    try {
      const stats = await backupService.getBackupStats();
      
      res.json(stats);
    } catch (error) {
      console.error('Get backup stats error:', error);
      res.status(500).json({ 
        error: 'Failed to get backup statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Verify backup
router.get(
  '/verify/:backupFileName',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const { backupFileName } = req.params;
      
      const result = await backupService.verifyBackup(backupFileName);
      
      if (result.success) {
        res.json({
          ...result,
          backupFileName
        });
      } else {
        res.status(404).json({
          success: false,
          error: result.error,
          backupFileName
        });
      }
    } catch (error) {
      console.error('Verify backup error:', error);
      res.status(500).json({ 
        error: 'Failed to verify backup',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Delete backup
router.delete(
  '/:backupFileName',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const { backupFileName } = req.params;
      const { confirm } = req.body;
      
      if (!confirm) {
        res.status(400).json({ 
          error: 'Confirmation required',
          message: 'Please confirm you want to delete this backup.'
        });
        return;
      }
      
      const backupService = new BackupService();
      const backups = await backupService.listBackups();
      const backupToDelete = backups.find(b => b.filename === backupFileName);
      
      if (!backupToDelete) {
        res.status(404).json({ 
          error: 'Backup not found',
          message: `Backup file '${backupFileName}' does not exist.`
        });
        return;
      }
      
      const backupPath = require('path').join(
        process.env.BACKUP_PATH || './backups',
        backupFileName
      );
      
      require('fs').unlinkSync(backupPath);
      
      // Log deletion in database
      const { db } = await import('../database/database');
      await db.run(
        'DELETE FROM backup_logs WHERE backup_file = ?',
        [backupFileName]
      );
      
      res.json({
        success: true,
        message: 'Backup deleted successfully',
        deletedFile: backupFileName,
        size: backupToDelete.formattedSize
      });
    } catch (error) {
      console.error('Delete backup error:', error);
      res.status(500).json({ 
        error: 'Failed to delete backup',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Trigger manual cleanup of old backups
router.post(
  '/cleanup',
  authenticate,
  async (_req: AuthRequest, res) => {
    try {
      const backupService = new BackupService();
      
      // This will trigger the cleanup logic
      await backupService['cleanupOldBackups']();
      
      const stats = await backupService.getBackupStats();
      
      res.json({
        success: true,
        message: 'Backup cleanup completed',
        stats
      });
    } catch (error) {
      console.error('Backup cleanup error:', error);
      res.status(500).json({ 
        error: 'Failed to clean up backups',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
