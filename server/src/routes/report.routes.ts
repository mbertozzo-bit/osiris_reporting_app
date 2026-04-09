import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { ReportController } from '../controllers/report.controller';

const router = express.Router();
const reportController = new ReportController();

// Get all reports with filtering
router.get(
  '/',
  authenticate,
  (req: AuthRequest, res) => reportController.getReports(req, res)
);

// Get report summary for a specific month/year
router.get(
  '/summary',
  authenticate,
  (req: AuthRequest, res) => reportController.getReportSummary(req, res)
);

// Get time series data for an agent
router.get(
  '/time-series',
  authenticate,
  (req: AuthRequest, res) => reportController.getAgentTimeSeries(req, res)
);

// Update agent comment
router.post(
  '/comments',
  authenticate,
  (req: AuthRequest, res) => reportController.updateAgentComment(req, res)
);

// Get available months/years
router.get(
  '/available-months',
  authenticate,
  (req: AuthRequest, res) => reportController.getAvailableMonths(req, res)
);

// Get agent list with search
router.get(
  '/agents',
  authenticate,
  (req: AuthRequest, res) => reportController.getAgentList(req, res)
);

// Export reports in various formats
router.get(
  '/export',
  authenticate,
  (req: AuthRequest, res) => reportController.exportReports(req, res)
);

// Update report data for a specific agent/month/year
router.put(
  '/manage',
  authenticate,
  (req: AuthRequest, res) => reportController.updateManagedReport(req, res)
);

// Delete report data for a specific agent/month/year
router.delete(
  '/manage/:agentId',
  authenticate,
  (req: AuthRequest, res) => reportController.deleteManagedReport(req, res)
);

// Get specific agent report
router.get(
  '/agent/:agentId',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const { agentId } = req.params;
      const { month, year } = req.query;
      
      let query = `
        SELECT mr.*, a.email, ac.comment
        FROM monthly_reports mr
        LEFT JOIN agents a ON mr.agent_id = a.agent_id
        LEFT JOIN agent_comments ac ON mr.agent_id = ac.agent_id 
          AND mr.month = ac.month AND mr.year = ac.year
        WHERE mr.agent_id = ?
      `;
      const params: any[] = [agentId];
      
      if (month && year) {
        query += ' AND mr.month = ? AND mr.year = ?';
        params.push(parseInt(month as string), parseInt(year as string));
      }
      
      query += ' ORDER BY mr.year DESC, mr.month DESC LIMIT 12';
      
      const reports = await (await import('../database/database')).db.all(query, params);
      
      if (reports.length === 0) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      
      res.json({
        agentId,
        agentName: reports[0].agent_name,
        email: reports[0].email,
        reports
      });
    } catch (error) {
      console.error('Get agent report error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch agent report',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
