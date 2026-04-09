import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { upload, validateUploadPeriod, validateUploadFiles, cleanupUploadedFiles } from '../middleware/upload.middleware';
import { UploadController } from '../controllers/upload.controller';

const router = express.Router();
const uploadController = new UploadController();

// Upload Excel files
router.post(
  '/',
  authenticate,
  upload.fields([
    { name: 'agentSummary', maxCount: 1 },
    { name: 'agentUnavailable', maxCount: 1 }
  ]),
  validateUploadPeriod,
  validateUploadFiles,
  cleanupUploadedFiles,
  (req: AuthRequest, res) => uploadController.uploadFiles(req, res)
);

// Check for duplicate data
router.get(
  '/check-duplicate',
  authenticate,
  (req: AuthRequest, res) => uploadController.checkDuplicate(req, res)
);

// Overwrite existing data
router.post(
  '/overwrite',
  authenticate,
  (req: AuthRequest, res) => uploadController.overwriteData(req, res)
);

// Get upload history
router.get(
  '/history',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const { limit = 10, offset = 0 } = req.query;
      
      // This would query the file_uploads table
      // For now, return placeholder
      res.json({
        uploads: [],
        total: 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });
    } catch (error) {
      console.error('Get upload history error:', error);
      res.status(500).json({ error: 'Failed to get upload history' });
    }
  }
);

export default router;
