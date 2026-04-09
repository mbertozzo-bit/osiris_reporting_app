import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { db } from '../database/database';
import logger from '../utils/logger';
import { auditLog } from '../utils/logger';

const EDITABLE_REPORT_FIELDS = [
  'total_handle_calls',
  'average_handle_time',
  'agent_unavailable_time_hours',
  'escalation_rate',
  'call_quality_score',
  'schedule_adherence',
  'refused_calls',
  'arf_seconds',
  'correcting_repost_seconds',
  'edit_transfer_seconds',
  'emails_seconds',
  'faxes_seconds',
  'meeting_seconds',
  'misc_seconds',
  'payment_plan_seconds',
  'personal_seconds',
  'printing_log_seconds',
  'statements_seconds',
  'task_seconds',
  'technical_issue_seconds',
  'training_seconds',
  'vms_seconds',
  'wrap_up_seconds',
  'break_seconds',
  'lunch_seconds',
  'total_seconds'
] as const;

const DECIMAL_REPORT_FIELDS = new Set<string>([
  'agent_unavailable_time_hours',
  'escalation_rate',
  'call_quality_score',
  'schedule_adherence',
  'refused_calls'
]);

export class ReportController {
  public async getReports(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month, year, agentId, page = 1, limit = 20 } = req.query;
      
      let query = `
        SELECT mr.*, a.email, ac.comment
        FROM monthly_reports mr
        LEFT JOIN agents a ON mr.agent_id = a.agent_id
        LEFT JOIN agent_comments ac ON mr.agent_id = ac.agent_id 
          AND mr.month = ac.month AND mr.year = ac.year
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (month) {
        query += ' AND mr.month = ?';
        params.push(parseInt(month as string));
      }
      
      if (year) {
        query += ' AND mr.year = ?';
        params.push(parseInt(year as string));
      }
      
      if (agentId) {
        query += ' AND mr.agent_id = ?';
        params.push(agentId);
      }
      
      // Add pagination
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      query += ' ORDER BY mr.agent_name LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), offset);
      
      const reports = await db.all(query, params);
      
      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) as total FROM monthly_reports mr WHERE 1=1';
      const countParams: any[] = [];
      
      if (month) {
        countQuery += ' AND mr.month = ?';
        countParams.push(parseInt(month as string));
      }
      
      if (year) {
        countQuery += ' AND mr.year = ?';
        countParams.push(parseInt(year as string));
      }
      
      if (agentId) {
        countQuery += ' AND mr.agent_id = ?';
        countParams.push(agentId);
      }
      
      const countResult = await db.get(countQuery, countParams) as { total?: number } | undefined;
      const total = Number(countResult?.total ?? 0);
      
      res.json({
        reports,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error) {
      logger.error('Get reports error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch reports',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async getReportSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month, year } = req.query;
      
      if (!month || !year) {
        res.status(400).json({ error: 'Month and year are required' });
        return;
      }
      
      const summary = await db.get(`
        SELECT 
          COUNT(*) as total_agents,
          SUM(total_handle_calls) as total_handle_calls,
          SUM(total_seconds) as total_aut_seconds,
          AVG(CAST(substr(average_handle_time, 1, 2) as INTEGER) * 60 + CAST(substr(average_handle_time, 4, 2) as INTEGER)) as avg_handle_time_minutes,
          SUM(refused_calls) as total_refused_calls,
          SUM(CAST(agent_unavailable_time_hours * 10000 as INTEGER)) / 10000.0 as total_aut_hours
        FROM monthly_reports 
        WHERE month = ? AND year = ?
      `, [parseInt(month as string), parseInt(year as string)]) as {
        total_agents?: number;
        total_handle_calls?: number;
        total_aut_seconds?: number;
        avg_handle_time_minutes?: number;
        total_refused_calls?: number;
        total_aut_hours?: number;
      } | undefined;
      const safeSummary = summary ?? {};
      
      // Format average handle time
      const avgMinutes = safeSummary.avg_handle_time_minutes || 0;
      const avgHours = Math.floor(avgMinutes / 60);
      const avgMins = Math.floor(avgMinutes % 60);
      
      res.json({
        month: parseInt(month as string),
        year: parseInt(year as string),
        totalAgents: safeSummary.total_agents || 0,
        totalHandleCalls: safeSummary.total_handle_calls || 0,
        totalAUTSeconds: safeSummary.total_aut_seconds || 0,
        totalAUTHours: safeSummary.total_aut_hours || 0,
        averageHandleTime: `${avgHours.toString().padStart(2, '0')}:${avgMins.toString().padStart(2, '0')}`,
        totalRefusedCalls: safeSummary.total_refused_calls || 0
      });
    } catch (error) {
      logger.error('Get report summary error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch report summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async getAgentTimeSeries(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId, criteria } = req.query;
      
      if (!agentId) {
        res.status(400).json({ error: 'Agent ID is required' });
        return;
      }
      
      let criteriaField = 'total_handle_calls'; // Default
      let criteriaLabel = 'Total Handle Calls';
      
      if (criteria) {
        const fieldMap: { [key: string]: { field: string, label: string } } = {
          'handle_calls': { field: 'total_handle_calls', label: 'Total Handle Calls' },
          'aut_hours': { field: 'agent_unavailable_time_hours', label: 'Agent Unavailable Time (Hours)' },
          'refused_calls': { field: 'refused_calls', label: 'Refused Calls' },
          'arf': { field: 'arf_seconds', label: 'ARF (Seconds)' },
          'edit_transfer': { field: 'edit_transfer_seconds', label: 'Edit & Transfer (Seconds)' },
          'personal': { field: 'personal_seconds', label: 'Personal (Seconds)' }
        };
        
        const mapping = fieldMap[criteria as string];
        if (mapping) {
          criteriaField = mapping.field;
          criteriaLabel = mapping.label;
        }
      }
      
      const timeSeries = await db.all(`
        SELECT 
          month,
          year,
          ${criteriaField} as value,
          agent_name
        FROM monthly_reports 
        WHERE agent_id = ?
        ORDER BY year, month
      `, [agentId]);
      
      res.json({
        agentId,
        criteria: criteriaLabel,
        timeSeries: timeSeries.map(row => ({
          date: `${row.year}-${row.month.toString().padStart(2, '0')}`,
          month: row.month,
          year: row.year,
          value: row.value,
          agentName: row.agent_name
        }))
      });
    } catch (error) {
      logger.error('Get agent time series error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch time series data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async updateAgentComment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId, month, year, comment } = req.body;
      if (!agentId || !month || !year || comment === undefined) {
        res.status(400).json({ error: 'Agent ID, month, year, and comment are required' });
        return;
      }
      
      // Insert or replace comment
      await db.run(`
        INSERT OR REPLACE INTO agent_comments (agent_id, month, year, comment, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [agentId, parseInt(month), parseInt(year), comment]);
      
      logger.info(`Updated comment for agent ${agentId} (${month}/${year})`);
      
      res.json({
        success: true,
        message: 'Comment updated successfully'
      });
    } catch (error) {
      logger.error('Update agent comment error:', error);
      res.status(500).json({ 
        error: 'Failed to update comment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async getAvailableMonths(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const months = await db.all(`
        SELECT DISTINCT month, year 
        FROM monthly_reports 
        ORDER BY year DESC, month DESC
      `);
      
      res.json({ months });
    } catch (error) {
      logger.error('Get available months error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch available months',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async getAgentList(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { search, month, year } = req.query;

      const params: any[] = [];
      const whereClauses: string[] = [];

      if (month !== undefined) {
        const monthNum = parseInt(month as string, 10);
        if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
          res.status(400).json({ error: 'Invalid month (1-12)' });
          return;
        }
        whereClauses.push('mr.month = ?');
        params.push(monthNum);
      }

      if (year !== undefined) {
        const yearNum = parseInt(year as string, 10);
        if (Number.isNaN(yearNum) || yearNum < 2020) {
          res.status(400).json({ error: 'Invalid year' });
          return;
        }
        whereClauses.push('mr.year = ?');
        params.push(yearNum);
      }

      if (search) {
        whereClauses.push('(mr.agent_name LIKE ? OR mr.agent_id LIKE ?)');
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
      }

      let query = `
        SELECT
          mr.agent_id,
          mr.agent_name,
          a.email,
          COUNT(DISTINCT (mr.year || '-' || printf('%02d', mr.month))) as report_count
        FROM monthly_reports mr
        LEFT JOIN agents a ON mr.agent_id = a.agent_id
      `;

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      query += ' GROUP BY mr.agent_id, mr.agent_name, a.email ORDER BY mr.agent_name';

      const agents = await db.all(query, params);
      
      res.json({ agents });
    } catch (error) {
      logger.error('Get agent list error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch agent list',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async exportReports(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month, year, format = 'json' } = req.query;
      
      if (!month || !year) {
        res.status(400).json({ error: 'Month and year are required' });
        return;
      }
      
      const reports = await db.all(`
        SELECT mr.*, a.email, ac.comment
        FROM monthly_reports mr
        LEFT JOIN agents a ON mr.agent_id = a.agent_id
        LEFT JOIN agent_comments ac ON mr.agent_id = ac.agent_id 
          AND mr.month = ac.month AND mr.year = ac.year
        WHERE mr.month = ? AND mr.year = ?
        ORDER BY mr.agent_name
      `, [parseInt(month as string), parseInt(year as string)]);
      
      if (format === 'csv') {
        // Convert to CSV
        const csvRows = [];
        
        // Header row
        const headers = Object.keys(reports[0] || {});
        csvRows.push(headers.join(','));
        
        // Data rows
        reports.forEach(report => {
          const row = headers.map(header => {
            const value = report[header];
            // Escape commas and quotes for CSV
            if (typeof value === 'string') {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          });
          csvRows.push(row.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=reports_${month}_${year}.csv`);
        res.send(csvContent);
      } else {
        // Default JSON format
        res.json({
          month: parseInt(month as string),
          year: parseInt(year as string),
          reports,
          total: reports.length,
          exportedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Export reports error:', error);
      res.status(500).json({ 
        error: 'Failed to export reports',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async updateManagedReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId, month, year, reportData, comment } = req.body;
      const username = req.user?.username || 'unknown';

      if (!agentId || month === undefined || year === undefined) {
        res.status(400).json({ error: 'Agent ID, month, and year are required' });
        return;
      }

      const monthNum = Number(month);
      const yearNum = Number(year);

      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        res.status(400).json({ error: 'Invalid month (1-12)' });
        return;
      }

      if (!Number.isInteger(yearNum) || yearNum < 2020) {
        res.status(400).json({ error: 'Invalid year' });
        return;
      }

      const existing = await db.get(
        'SELECT id FROM monthly_reports WHERE agent_id = ? AND month = ? AND year = ?',
        [String(agentId), monthNum, yearNum]
      );

      if (!existing) {
        res.status(404).json({ error: 'Report not found for selected agent/month/year' });
        return;
      }

      const incomingData = reportData && typeof reportData === 'object' ? reportData : {};
      const parsedData: Record<string, string | number | null> = {};

      for (const field of EDITABLE_REPORT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(incomingData, field)) {
          continue;
        }

        parsedData[field] = this.normalizeReportFieldValue(field, incomingData[field]);
      }

      if (Object.keys(parsedData).length === 0 && comment === undefined) {
        res.status(400).json({ error: 'No editable data provided' });
        return;
      }

      if (Object.keys(parsedData).length > 0) {
        const fields = Object.keys(parsedData);
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => parsedData[field]);

        await db.run(
          `UPDATE monthly_reports
           SET ${setClause}, updated_at = CURRENT_TIMESTAMP
           WHERE agent_id = ? AND month = ? AND year = ?`,
          [...values, String(agentId), monthNum, yearNum]
        );
      }

      if (comment !== undefined) {
        const normalizedComment = String(comment ?? '').trim();

        if (!normalizedComment) {
          await db.run(
            'DELETE FROM agent_comments WHERE agent_id = ? AND month = ? AND year = ?',
            [String(agentId), monthNum, yearNum]
          );
        } else {
          await db.run(
            `INSERT OR REPLACE INTO agent_comments (agent_id, month, year, comment, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [String(agentId), monthNum, yearNum, normalizedComment]
          );
        }
      }

      const updated = await db.get(
        `SELECT mr.*, a.email, ac.comment
         FROM monthly_reports mr
         LEFT JOIN agents a ON mr.agent_id = a.agent_id
         LEFT JOIN agent_comments ac ON mr.agent_id = ac.agent_id
           AND mr.month = ac.month AND mr.year = ac.year
         WHERE mr.agent_id = ? AND mr.month = ? AND mr.year = ?`,
        [String(agentId), monthNum, yearNum]
      );

      auditLog(
        username,
        'REPORT_DATA_UPDATED',
        'monthly_reports',
        `${agentId}:${monthNum}/${yearNum}`,
        'Edited report data through Data Management'
      );

      res.json({
        success: true,
        message: 'Report data updated successfully',
        report: updated
      });
    } catch (error) {
      logger.error('Update managed report error:', error);
      res.status(500).json({
        error: 'Failed to update report data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async deleteManagedReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const { month, year } = req.query;
      const username = req.user?.username || 'unknown';

      if (!agentId || !month || !year) {
        res.status(400).json({ error: 'Agent ID, month, and year are required' });
        return;
      }

      const monthNum = Number(month);
      const yearNum = Number(year);

      if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
        res.status(400).json({ error: 'Invalid month (1-12)' });
        return;
      }

      if (!Number.isInteger(yearNum) || yearNum < 2020) {
        res.status(400).json({ error: 'Invalid year' });
        return;
      }

      const report = await db.get(
        'SELECT agent_name FROM monthly_reports WHERE agent_id = ? AND month = ? AND year = ?',
        [String(agentId), monthNum, yearNum]
      );

      if (!report) {
        res.status(404).json({ error: 'Report not found for selected agent/month/year' });
        return;
      }

      await db.run('BEGIN TRANSACTION');

      try {
        const emailRows = await db.all(
          'SELECT id FROM email_history WHERE agent_id = ? AND month = ? AND year = ?',
          [String(agentId), monthNum, yearNum]
        );

        const emailIds = emailRows.map(row => row.id).filter((id: unknown) => typeof id === 'number');

        if (emailIds.length > 0) {
          const placeholders = emailIds.map(() => '?').join(', ');

          await db.run(
            `DELETE FROM email_delivery_reports WHERE email_history_id IN (${placeholders})`,
            emailIds
          );
        }

        await db.run(
          'DELETE FROM email_history WHERE agent_id = ? AND month = ? AND year = ?',
          [String(agentId), monthNum, yearNum]
        );

        await db.run(
          'DELETE FROM agent_comments WHERE agent_id = ? AND month = ? AND year = ?',
          [String(agentId), monthNum, yearNum]
        );

        const deleteResult = await db.run(
          'DELETE FROM monthly_reports WHERE agent_id = ? AND month = ? AND year = ?',
          [String(agentId), monthNum, yearNum]
        );

        await db.run('COMMIT');

        auditLog(
          username,
          'REPORT_DATA_DELETED',
          'monthly_reports',
          `${agentId}:${monthNum}/${yearNum}`,
          `Deleted report data for ${report.agent_name}`
        );

        res.json({
          success: true,
          message: `Deleted report data for ${report.agent_name} (${monthNum}/${yearNum})`,
          deleted: {
            reportRows: deleteResult.changes || 0,
            emailHistoryRows: emailIds.length
          }
        });
      } catch (innerError) {
        await db.run('ROLLBACK');
        throw innerError;
      }
    } catch (error) {
      logger.error('Delete managed report error:', error);
      res.status(500).json({
        error: 'Failed to delete report data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private normalizeReportFieldValue(field: string, rawValue: unknown): string | number | null {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }

    if (field === 'average_handle_time') {
      return String(rawValue).trim();
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`Invalid numeric value for ${field}`);
    }

    if (DECIMAL_REPORT_FIELDS.has(field)) {
      return numericValue;
    }

    return Math.round(numericValue);
  }
}
