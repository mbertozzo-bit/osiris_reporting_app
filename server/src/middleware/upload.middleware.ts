import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter to allow only Excel files
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
  }
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
    files: 2 // Maximum 2 files at once
  }
});

// Validate selected period before checking required files.
export function validateUploadPeriod(req: Request, res: any, next: Function) {
  const monthRaw = req.body?.month;
  const yearRaw = req.body?.year;

  const monthNum = Number.parseInt(String(monthRaw), 10);
  const yearNum = Number.parseInt(String(yearRaw), 10);

  if (Number.isNaN(monthNum) || Number.isNaN(yearNum)) {
    next();
    return;
  }

  const allowInProgress = String(req.body?.allowInProgressMonths || '').toLowerCase() === 'true';
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const monthClosed = yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth);

  if (!allowInProgress && !monthClosed) {
    return res.status(400).json({
      error: 'In-progress month upload blocked',
      message: 'Selected month is not complete yet. Enable override to proceed.'
    });
  }

  next();
}

// Validate upload files middleware
export function validateUploadFiles(req: Request, res: any, next: Function) {
  const filesByField = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) || {};
  const agentSummaryFile = filesByField.agentSummary?.[0];
  const agentUnavailableFile = filesByField.agentUnavailable?.[0];

  if (!agentSummaryFile || !agentUnavailableFile) {
    return res.status(400).json({
      error: 'Both Agent Summary and Agent Unavailable Time files are required'
    });
  }

  const files = [agentSummaryFile, agentUnavailableFile];
  if (files.length !== 2) {
    return res.status(400).json({ error: 'Please upload exactly 2 Excel files' });
  }

  // Optional name sanity checks to avoid obvious mismatches.
  const summaryName = agentSummaryFile.originalname.toLowerCase();
  const unavailableName = agentUnavailableFile.originalname.toLowerCase();

  if (!summaryName.includes('summary')) {
    return res.status(400).json({
      error: 'Agent Summary filename should include "summary"'
    });
  }

  if (!unavailableName.includes('unavailable')) {
    return res.status(400).json({
      error: 'Agent Unavailable filename should include "unavailable"'
    });
  }
  
  next();
}

// Clean up uploaded files middleware
export function cleanupUploadedFiles(req: Request, res: any, next: Function) {
  // Store cleanup function to be called after response
  res.on('finish', () => {
    try {
      if (req.files) {
        const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
        files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
    } catch (error) {
      console.error('Error cleaning up uploaded files:', error);
    }
  });
  
  next();
}
