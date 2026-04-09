import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { AgentController } from '../controllers/agent.controller';

const router = express.Router();
const agentController = new AgentController();

// Get all agents with pagination and search
router.get(
  '/',
  authenticate,
  (req: AuthRequest, res) => agentController.getAgents(req, res)
);

// Get single agent
router.get(
  '/:agentId',
  authenticate,
  (req: AuthRequest, res) => agentController.getAgent(req, res)
);

// Create new agent
router.post(
  '/',
  authenticate,
  (req: AuthRequest, res) => agentController.createAgent(req, res)
);

// Update agent
router.put(
  '/:agentId',
  authenticate,
  (req: AuthRequest, res) => agentController.updateAgent(req, res)
);

// Delete agent
router.delete(
  '/:agentId',
  authenticate,
  (req: AuthRequest, res) => agentController.deleteAgent(req, res)
);

// Bulk update agents
router.post(
  '/bulk-update',
  authenticate,
  (req: AuthRequest, res) => agentController.bulkUpdateAgents(req, res)
);

// Export agents
router.get(
  '/export/agents',
  authenticate,
  (req: AuthRequest, res) => agentController.exportAgents(req, res)
);

// Import agents from CSV/JSON (placeholder)
router.post(
  '/import',
  authenticate,
  async (_req: AuthRequest, res) => {
    try {
      // This would handle file upload and parsing for agent imports
      res.json({ 
        success: false, 
        message: 'Agent import functionality not yet implemented' 
      });
    } catch (error) {
      console.error('Import agents error:', error);
      res.status(500).json({ 
        error: 'Failed to import agents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Sync agents from reports (automatically add agents found in reports)
router.post(
  '/sync-from-reports',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const username = req.user?.username || 'unknown';
      
      // Find agents in reports that aren't in agents table
      const missingAgents = await (await import('../database/database')).db.all(`
        SELECT DISTINCT agent_id, agent_name
        FROM monthly_reports mr
        WHERE NOT EXISTS (
          SELECT 1 FROM agents a WHERE a.agent_id = mr.agent_id
        )
      `);
      
      let syncedCount = 0;
      const errors: string[] = [];
      
      if (missingAgents.length > 0) {
        const insertStmt = await (await import('../database/database')).db.prepare(`
          INSERT INTO agents (agent_id, full_name) VALUES (?, ?)
        `);
        
        for (const agent of missingAgents) {
          try {
            await insertStmt.run(agent.agent_id, agent.agent_name);
            syncedCount++;
          } catch (error) {
            errors.push(`Failed to sync agent ${agent.agent_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        await insertStmt.finalize();
      }
      
      (await import('../utils/logger')).auditLog(
        username,
        'AGENT_SYNC',
        'agents',
        'multiple',
        `Synced ${syncedCount} agents from reports`
      );
      
      res.json({
        success: true,
        message: `Synced ${syncedCount} agents from reports`,
        syncedCount,
        totalMissing: missingAgents.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error('Sync agents error:', error);
      res.status(500).json({ 
        error: 'Failed to sync agents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
