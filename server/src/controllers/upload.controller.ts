import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ExcelParserService, ConsolidatedReport } from '../services/excel/ExcelParserService';
import { db } from '../database/database';
import logger, { fileLog, auditLog } from '../utils/logger';

export class UploadController {
  private parserService: ExcelParserService;

  constructor() {
    this.parserService = new ExcelParserService();
  }

  public async uploadFiles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month, year, allowInProgressMonths } = req.body;
      const username = req.user?.username || 'unknown';
      
      if (!month || !year) {
        res.status(400).json({ error: 'Month and year are required' });
        return;
      }

      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        res.status(400).json({ error: 'Invalid month (1-12)' });
        return;
      }
      
      if (isNaN(yearNum) || yearNum < 2020) {
        res.status(400).json({ error: 'Invalid year' });
        return;
      }

      const allowInProgress = String(allowInProgressMonths || '').toLowerCase() === 'true';
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const monthClosed = yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth);

      if (!allowInProgress && !monthClosed) {
        res.status(400).json({
          error: 'In-progress month upload blocked',
          message: 'Selected month is not complete yet. Enable override to proceed.'
        });
        return;
      }

      // Check for duplicate data
      const duplicateCount = await db.get(
        'SELECT COUNT(*) as count FROM monthly_reports WHERE month = ? AND year = ?',
        [monthNum, yearNum]
      ) as { count?: number } | undefined;
      const duplicateCountValue = Number(duplicateCount?.count ?? 0);
      
      if (duplicateCountValue > 0) {
        res.status(409).json({ 
          error: 'Data already exists',
          message: `Data for ${monthNum}/${yearNum} already exists in the database.`,
          duplicate: true
        });
        return;
      }

      // Get uploaded files from named multer fields
      const filesByField = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const agentSummaryFile = filesByField?.agentSummary?.[0];
      const agentUnavailableFile = filesByField?.agentUnavailable?.[0];

      if (!agentSummaryFile || !agentUnavailableFile) {
        res.status(400).json({ 
          error: 'Both Agent Summary and Agent Unavailable Time files are required' 
        });
        return;
      }

      const files = [agentSummaryFile, agentUnavailableFile];

      // Log file upload
      files.forEach(file => {
        fileLog(
          file.originalname,
          'excel',
          monthNum,
          yearNum,
          'uploaded',
          `Size: ${file.size} bytes`
        );
      });

      // Parse files
      const summaryData = await this.parserService.parseAgentSummary(agentSummaryFile.path);
      const unavailableData = await this.parserService.parseAgentUnavailableTime(agentUnavailableFile.path);

      // Consolidate data
      const consolidatedReports = this.parserService.consolidateData(
        summaryData,
        unavailableData,
        monthNum,
        yearNum
      );

      // Store in database
      await this.storeConsolidatedData(consolidatedReports, monthNum, yearNum);

      // Update agents table
      await this.updateAgentsTable(consolidatedReports);

      // Log successful processing
      files.forEach(file => {
        fileLog(
          file.originalname,
          'excel',
          monthNum,
          yearNum,
          'processed',
          `Agents processed: ${consolidatedReports.length}`
        );
      });

      auditLog(
        username,
        'FILE_UPLOAD',
        'monthly_reports',
        `${monthNum}/${yearNum}`,
        `Processed ${consolidatedReports.length} agents`
      );

      res.json({
        success: true,
        message: `Successfully processed ${consolidatedReports.length} agents for ${monthNum}/${yearNum}`,
        data: {
          agentsProcessed: consolidatedReports.length,
          month: monthNum,
          year: yearNum,
          summary: this.getSummaryStats(consolidatedReports)
        }
      });

    } catch (error) {
      logger.error('Upload processing error:', error);
      res.status(500).json({ 
        error: 'Failed to process files',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async storeConsolidatedData(
    reports: ConsolidatedReport[],
    month: number,
    year: number
  ): Promise<void> {
    const insertStmt = await db.prepare(`
      INSERT INTO monthly_reports (
        month, year, agent_id, agent_name,
        total_handle_calls, average_handle_time, agent_unavailable_time_hours,
        refused_calls,
        arf_seconds, correcting_repost_seconds, edit_transfer_seconds,
        emails_seconds, faxes_seconds, meeting_seconds, misc_seconds,
        payment_plan_seconds, personal_seconds, printing_log_seconds,
        statements_seconds, task_seconds, technical_issue_seconds,
        training_seconds, vms_seconds, wrap_up_seconds, break_seconds,
        lunch_seconds, total_seconds
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    try {
      for (const report of reports) {
        await insertStmt.run(
          month,
          year,
          report.agentId,
          report.agentName,
          report.totalHandleCalls,
          report.averageHandleTime,
          report.agentUnavailableTimeHours,
          report.refusedCalls,
          report.arfSeconds,
          report.correctingRepostSeconds,
          report.editTransferSeconds,
          report.emailsSeconds,
          report.faxesSeconds,
          report.meetingSeconds,
          report.miscSeconds,
          report.paymentPlanSeconds,
          report.personalSeconds,
          report.printingLogSeconds,
          report.statementsSeconds,
          report.taskSeconds,
          report.technicalIssueSeconds,
          report.trainingSeconds,
          report.vmsSeconds,
          report.wrapUpSeconds,
          report.breakSeconds,
          report.lunchSeconds,
          report.totalSeconds
        );
      }
      
      await insertStmt.finalize();
      logger.info(`Stored ${reports.length} consolidated reports in database`);
    } catch (error) {
      await insertStmt.finalize();
      throw error;
    }
  }

  private async updateAgentsTable(reports: ConsolidatedReport[]): Promise<void> {
    const insertStmt = await db.prepare(`
      INSERT INTO agents (agent_id, full_name, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id) DO UPDATE SET
        full_name = excluded.full_name,
        updated_at = CURRENT_TIMESTAMP
    `);

    try {
      for (const report of reports) {
        await insertStmt.run(report.agentId, report.agentName);
      }
      
      await insertStmt.finalize();
      logger.info(`Updated ${reports.length} agents in agents table`);
    } catch (error) {
      await insertStmt.finalize();
      throw error;
    }
  }

  private getSummaryStats(reports: ConsolidatedReport[]): any {
    const totalHandleCalls = reports.reduce((sum, r) => sum + r.totalHandleCalls, 0);
    const totalAUTHours = reports.reduce((sum, r) => sum + r.agentUnavailableTimeHours, 0);
    const totalRefusedCalls = reports.reduce((sum, r) => sum + r.refusedCalls, 0);
    
    return {
      totalAgents: reports.length,
      totalHandleCalls,
      totalAUTHours: parseFloat(totalAUTHours.toFixed(4)),
      totalRefusedCalls,
      averageHandleTime: this.calculateAverageHandleTime(reports),
      averageAUTPerAgent: parseFloat((totalAUTHours / reports.length).toFixed(4))
    };
  }

  private calculateAverageHandleTime(reports: ConsolidatedReport[]): string {
    const totalSeconds = reports.reduce((sum, report) => {
      const [hours, minutes] = report.averageHandleTime.split(':').map(Number);
      return sum + (hours * 3600) + (minutes * 60);
    }, 0);
    
    const averageSeconds = totalSeconds / reports.length;
    const avgHours = Math.floor(averageSeconds / 3600);
    const avgMinutes = Math.floor((averageSeconds % 3600) / 60);
    
    return `${avgHours.toString().padStart(2, '0')}:${avgMinutes.toString().padStart(2, '0')}`;
  }

  public async checkDuplicate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month, year } = req.query;
      
      if (!month || !year) {
        res.status(400).json({ error: 'Month and year are required' });
        return;
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);
      
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        res.status(400).json({ error: 'Invalid month (1-12)' });
        return;
      }
      
      if (isNaN(yearNum) || yearNum < 2020) {
        res.status(400).json({ error: 'Invalid year' });
        return;
      }

      const duplicateCount = await db.get(
        'SELECT COUNT(*) as count FROM monthly_reports WHERE month = ? AND year = ?',
        [monthNum, yearNum]
      ) as { count?: number } | undefined;
      const duplicateCountValue = Number(duplicateCount?.count ?? 0);
      
      res.json({
        exists: duplicateCountValue > 0,
        count: duplicateCountValue,
        month: monthNum,
        year: yearNum
      });

    } catch (error) {
      logger.error('Duplicate check error:', error);
      res.status(500).json({ 
        error: 'Failed to check for duplicates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async overwriteData(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { month, year } = req.body;
      const username = req.user?.username || 'unknown';
      
      if (!month || !year) {
        res.status(400).json({ error: 'Month and year are required' });
        return;
      }

      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      
      // Delete existing data
      await db.run(
        'DELETE FROM monthly_reports WHERE month = ? AND year = ?',
        [monthNum, yearNum]
      );
      
      await db.run(
        'DELETE FROM agent_comments WHERE month = ? AND year = ?',
        [monthNum, yearNum]
      );
      
      await db.run(
        'DELETE FROM email_history WHERE month = ? AND year = ?',
        [monthNum, yearNum]
      );

      auditLog(
        username,
        'DATA_OVERWRITE',
        'monthly_reports',
        `${monthNum}/${yearNum}`,
        'Deleted existing data for overwrite'
      );

      res.json({
        success: true,
        message: `Data for ${monthNum}/${yearNum} has been deleted and is ready for new upload`
      });

    } catch (error) {
      logger.error('Overwrite error:', error);
      res.status(500).json({ 
        error: 'Failed to overwrite data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
