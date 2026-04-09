import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { db } from '../database/database';
import logger, { auditLog } from '../utils/logger';

export class AgentController {
  public async getAgents(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 20, search, sortBy = 'full_name', sortOrder = 'asc' } = req.query;
      
      let query = 'SELECT * FROM agents WHERE 1=1';
      const params: any[] = [];
      
      if (search) {
        query += ' AND (full_name LIKE ? OR agent_id LIKE ? OR email LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }
      
      // Validate sort column
      const validSortColumns = ['full_name', 'agent_id', 'email', 'created_at'];
      const sortColumn = validSortColumns.includes(sortBy as string) ? sortBy : 'full_name';
      const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
      
      // Add pagination
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      query += ` ORDER BY ${sortColumn} ${order} LIMIT ? OFFSET ?`;
      params.push(parseInt(limit as string), offset);
      
      const agents = await db.all(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM agents WHERE 1=1';
      const countParams: any[] = [];
      
      if (search) {
        countQuery += ' AND (full_name LIKE ? OR agent_id LIKE ? OR email LIKE ?)';
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm, searchTerm);
      }
      
      const countResult = await db.get(countQuery, countParams) as { total?: number } | undefined;
      const total = Number(countResult?.total ?? 0);
      
      res.json({
        agents,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error) {
      logger.error('Get agents error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch agents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async getAgent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      
      const agent = await db.get(
        'SELECT * FROM agents WHERE agent_id = ?',
        [agentId]
      );
      
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      
      // Get agent's report history
      const reports = await db.all(`
        SELECT month, year, total_handle_calls, agent_unavailable_time_hours, refused_calls
        FROM monthly_reports 
        WHERE agent_id = ?
        ORDER BY year DESC, month DESC
        LIMIT 6
      `, [agentId]);
      
      // Get latest comment
      const latestComment = await db.get(`
        SELECT comment, month, year
        FROM agent_comments
        WHERE agent_id = ?
        ORDER BY year DESC, month DESC
        LIMIT 1
      `, [agentId]);
      
      res.json({
        ...agent,
        reportHistory: reports,
        latestComment
      });
    } catch (error) {
      logger.error('Get agent error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async createAgent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agent_id, full_name, email } = req.body;
      const username = req.user?.username || 'unknown';
      
      if (!agent_id || !full_name) {
        res.status(400).json({ error: 'Agent ID and full name are required' });
        return;
      }
      
      // Validate email format if provided
      if (email && !this.isValidEmail(email)) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
      
      // Check if agent already exists
      const existingAgent = await db.get(
        'SELECT agent_id FROM agents WHERE agent_id = ?',
        [agent_id]
      );
      
      if (existingAgent) {
        res.status(409).json({ error: 'Agent with this ID already exists' });
        return;
      }
      
      await db.run(
        'INSERT INTO agents (agent_id, full_name, email) VALUES (?, ?, ?)',
        [agent_id, full_name, email || null]
      );
      
      auditLog(
        username,
        'AGENT_CREATE',
        'agents',
        agent_id,
        `Created agent: ${full_name} (${agent_id})`
      );
      
      logger.info(`Created agent: ${full_name} (${agent_id})`);
      
      res.status(201).json({
        success: true,
        message: 'Agent created successfully',
        agent: { agent_id, full_name, email }
      });
    } catch (error) {
      logger.error('Create agent error:', error);
      res.status(500).json({ 
        error: 'Failed to create agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async updateAgent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const { full_name, email } = req.body;
      const username = req.user?.username || 'unknown';
      
      if (!full_name && email === undefined) {
        res.status(400).json({ error: 'At least one field (full_name or email) must be provided' });
        return;
      }
      
      // Validate email format if provided
      if (email && !this.isValidEmail(email)) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
      
      // Build update query dynamically
      const updates: string[] = [];
      const params: any[] = [];
      
      if (full_name) {
        updates.push('full_name = ?');
        params.push(full_name);
      }
      
      if (email !== undefined) {
        updates.push('email = ?');
        params.push(email || null);
      }
      
      updates.push('updated_at = CURRENT_TIMESTAMP');
      
      params.push(agentId);
      
      const result = await db.run(
        `UPDATE agents SET ${updates.join(', ')} WHERE agent_id = ?`,
        params
      );
      
      if (result.changes === 0) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      
      auditLog(
        username,
        'AGENT_UPDATE',
        'agents',
        agentId,
        `Updated agent: ${full_name || 'fields'}`
      );
      
      logger.info(`Updated agent: ${agentId}`);
      
      res.json({
        success: true,
        message: 'Agent updated successfully'
      });
    } catch (error) {
      logger.error('Update agent error:', error);
      res.status(500).json({ 
        error: 'Failed to update agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async deleteAgent(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const username = req.user?.username || 'unknown';
      
      // Check if agent has reports
      const reportCount = await db.get(
        'SELECT COUNT(*) as count FROM monthly_reports WHERE agent_id = ?',
        [agentId]
      ) as { count?: number } | undefined;
      const reportCountValue = Number(reportCount?.count ?? 0);
      
      if (reportCountValue > 0) {
        res.status(400).json({ 
          error: 'Cannot delete agent with existing reports',
          reportCount: reportCountValue
        });
        return;
      }
      
      const result = await db.run(
        'DELETE FROM agents WHERE agent_id = ?',
        [agentId]
      );
      
      if (result.changes === 0) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      
      // Also delete any comments for this agent
      await db.run(
        'DELETE FROM agent_comments WHERE agent_id = ?',
        [agentId]
      );
      
      auditLog(
        username,
        'AGENT_DELETE',
        'agents',
        agentId,
        'Deleted agent'
      );
      
      logger.info(`Deleted agent: ${agentId}`);
      
      res.json({
        success: true,
        message: 'Agent deleted successfully'
      });
    } catch (error) {
      logger.error('Delete agent error:', error);
      res.status(500).json({ 
        error: 'Failed to delete agent',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async bulkUpdateAgents(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agents } = req.body;
      const username = req.user?.username || 'unknown';
      
      if (!Array.isArray(agents) || agents.length === 0) {
        res.status(400).json({ error: 'Agents array is required' });
        return;
      }
      
      const updateStmt = await db.prepare(`
        UPDATE agents 
        SET full_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE agent_id = ?
      `);
      
      let updatedCount = 0;
      let errors: string[] = [];
      
      for (const agent of agents) {
        try {
          if (!agent.agent_id || !agent.full_name) {
            errors.push(`Missing required fields for agent: ${JSON.stringify(agent)}`);
            continue;
          }
          
          if (agent.email && !this.isValidEmail(agent.email)) {
            errors.push(`Invalid email for agent ${agent.agent_id}: ${agent.email}`);
            continue;
          }
          
          const result = await updateStmt.run(
            agent.full_name,
            agent.email || null,
            agent.agent_id
          );
          
          if ((result as any).changes > 0) {
            updatedCount++;
          }
        } catch (error) {
          errors.push(`Error updating agent ${agent.agent_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      await updateStmt.finalize();
      
      auditLog(
        username,
        'AGENT_BULK_UPDATE',
        'agents',
        'multiple',
        `Updated ${updatedCount} agents`
      );
      
      res.json({
        success: true,
        message: `Updated ${updatedCount} agents`,
        updatedCount,
        totalProcessed: agents.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      logger.error('Bulk update agents error:', error);
      res.status(500).json({ 
        error: 'Failed to bulk update agents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async exportAgents(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { format = 'csv' } = req.query;
      
      const agents = await db.all(`
        SELECT 
          a.*,
          COUNT(DISTINCT (mr.year || '-' || printf('%02d', mr.month))) as report_count,
          MAX(mr.year || '-' || mr.month) as latest_report
        FROM agents a
        LEFT JOIN monthly_reports mr ON a.agent_id = mr.agent_id
        GROUP BY a.agent_id, a.full_name, a.email, a.created_at, a.updated_at
        ORDER BY a.full_name
      `);
      
      if (format === 'csv') {
        const csvRows = [];
        
        // Header row
        const headers = ['Agent ID', 'Full Name', 'Email', 'Report Count', 'Latest Report', 'Created At', 'Updated At'];
        csvRows.push(headers.join(','));
        
        // Data rows
        agents.forEach(agent => {
          const row = [
            agent.agent_id,
            `"${agent.full_name.replace(/"/g, '""')}"`,
            agent.email ? `"${agent.email.replace(/"/g, '""')}"` : '',
            agent.report_count || 0,
            agent.latest_report || '',
            agent.created_at,
            agent.updated_at
          ];
          csvRows.push(row.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=agents_export.csv');
        res.send(csvContent);
      } else {
        res.json({
          agents,
          total: agents.length,
          exportedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Export agents error:', error);
      res.status(500).json({ 
        error: 'Failed to export agents',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
