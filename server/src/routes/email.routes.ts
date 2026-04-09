import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { EmailController } from '../controllers/email.controller';

const router = express.Router();
const emailController = new EmailController();

// Send email to single agent
router.post(
  '/send',
  authenticate,
  (req: AuthRequest, res) => emailController.sendAgentEmail(req, res)
);

// Send bulk emails to multiple agents
router.post(
  '/send-bulk',
  authenticate,
  (req: AuthRequest, res) => emailController.sendBulkEmails(req, res)
);

// Get email history
router.get(
  '/history',
  authenticate,
  (req: AuthRequest, res) => emailController.getEmailHistory(req, res)
);

// Retry failed email
router.post(
  '/retry/:emailHistoryId',
  authenticate,
  (req: AuthRequest, res) => emailController.retryFailedEmail(req, res)
);

// Get email status by message ID
router.get(
  '/status/:messageId',
  authenticate,
  (req: AuthRequest, res) => emailController.getEmailStatus(req, res)
);

// Get email service configuration status
router.get(
  '/config',
  authenticate,
  async (_req: AuthRequest, res) => {
    try {
      res.json(emailController.getServiceConfig());
    } catch (error) {
      console.error('Get email config error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch email configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Webhook for email delivery notifications (placeholder)
router.post(
  '/webhook/delivery',
  async (req, res) => {
    try {
      // This endpoint would receive webhooks from Microsoft Graph
      // for email delivery status updates
      console.log('Email delivery webhook received:', req.body);
      
      // Process delivery status updates
      // Update email_delivery_reports table
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Email webhook error:', error);
      res.status(500).send('Internal server error');
    }
  }
);

export default router;
