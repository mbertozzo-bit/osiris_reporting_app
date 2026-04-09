import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { EmailService } from '../services/email/EmailService';
import { db } from '../database/database';
import logger, { auditLog, emailLog } from '../utils/logger';

export class EmailController {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  public async sendAgentEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId, month, year, subject, preview = false, ccRecipients } = req.body;
      const username = req.user?.username || 'unknown';
      const ccValidation = this.normalizeAndValidateCcRecipients(ccRecipients);

      if (!ccValidation.valid) {
        res.status(400).json({ error: ccValidation.error || 'Invalid CC recipients' });
        return;
      }
      
      if (!agentId || !month || !year) {
        res.status(400).json({ error: 'Agent ID, month, and year are required' });
        return;
      }
      
      if (!preview && !this.emailService.isConfigured()) {
        res.status(500).json({ 
          error: 'Email service not configured',
          message: 'Microsoft Graph email sender is not configured'
        });
        return;
      }
      
      // Get agent data
      const agentData = await db.get(`
        SELECT 
          mr.*,
          a.email,
          ac.comment
        FROM monthly_reports mr
        LEFT JOIN agents a ON mr.agent_id = a.agent_id
        LEFT JOIN agent_comments ac ON mr.agent_id = ac.agent_id 
          AND mr.month = ac.month AND mr.year = ac.year
        WHERE mr.agent_id = ? AND mr.month = ? AND mr.year = ?
      `, [agentId, month, year]);
      
      if (!agentData) {
        res.status(404).json({ error: 'Agent report not found for specified month/year' });
        return;
      }
      
      if (!agentData.email) {
        res.status(400).json({ error: 'Agent has no email address configured' });
        return;
      }
      
      // Check if email was already sent
      const existingEmail = await db.get(
        'SELECT * FROM email_history WHERE agent_id = ? AND month = ? AND year = ? AND status = ?',
        [agentId, month, year, 'sent']
      );
      
      if (existingEmail && !preview) {
        res.status(409).json({ 
          error: 'Email already sent',
          messageId: existingEmail.message_id,
          sentAt: existingEmail.sent_at
        });
        return;
      }
      
      // Generate email content
      const emailSubject = subject || `Monthly Performance Report - ${this.getMonthName(month)} ${year}`;
      const htmlBody = this.generateEmailHTML({
        agentName: agentData.agent_name,
        month: parseInt(month),
        year: parseInt(year),
        totalHandleCalls: agentData.total_handle_calls,
        averageHandleTime: agentData.average_handle_time,
        agentUnavailableTimeHours: agentData.agent_unavailable_time_hours,
        refusedCalls: agentData.refused_calls,
        comment: agentData.comment,
        arfSeconds: agentData.arf_seconds,
        editTransferSeconds: agentData.edit_transfer_seconds,
        meetingSeconds: agentData.meeting_seconds,
        personalSeconds: agentData.personal_seconds,
        technicalIssueSeconds: agentData.technical_issue_seconds,
        trainingSeconds: agentData.training_seconds,
        lunchSeconds: agentData.lunch_seconds,
        totalSeconds: agentData.total_seconds
      });
      
      if (preview) {
        // Return preview without sending
        res.json({
          preview: true,
          to: agentData.email,
          ccRecipients: ccValidation.recipients,
          subject: emailSubject,
          htmlBody,
          agentName: agentData.agent_name,
          month,
          year
        });
        return;
      }
      
      // Send email
      const result = await this.emailService.sendEmail({
        to: agentData.email,
        ccRecipients: ccValidation.recipients,
        subject: emailSubject,
        htmlBody,
        agentId,
        month: parseInt(month),
        year: parseInt(year)
      });
      
      if (result.success) {
        auditLog(
          username,
          'EMAIL_SEND',
          'email_history',
          result.messageId,
          `Sent email to ${agentData.agent_name} (${agentId})`
        );
        
        emailLog(agentId, result.messageId || 'unknown', 'sent', `To: ${agentData.email}`);
        
        res.json({
          success: true,
          message: 'Email sent successfully',
          messageId: result.messageId,
          from: this.emailService.getConfig().senderAddress,
          to: agentData.email,
          ccRecipients: ccValidation.recipients,
          agentName: agentData.agent_name
        });
      } else {
        auditLog(
          username,
          'EMAIL_FAILED',
          'email_history',
          agentId,
          `Failed to send email to ${agentData.agent_name}: ${result.error}`
        );
        
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to send email',
          message: result.error
        });
      }
    } catch (error) {
      logger.error('Send agent email error:', error);
      res.status(500).json({ 
        error: 'Failed to send email',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async sendBulkEmails(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentIds, month, year, subjectTemplate, preview = false, ccRecipients } = req.body;
      const username = req.user?.username || 'unknown';
      const ccValidation = this.normalizeAndValidateCcRecipients(ccRecipients);

      if (!ccValidation.valid) {
        res.status(400).json({ error: ccValidation.error || 'Invalid CC recipients' });
        return;
      }
      
      if (!Array.isArray(agentIds) || agentIds.length === 0) {
        res.status(400).json({ error: 'Agent IDs array is required' });
        return;
      }
      
      if (!month || !year) {
        res.status(400).json({ error: 'Month and year are required' });
        return;
      }
      
      if (!preview && !this.emailService.isConfigured()) {
        res.status(500).json({ 
          error: 'Email service not configured',
          message: 'Microsoft Graph email sender is not configured'
        });
        return;
      }
      
      // Validate all agents exist and have emails
      const invalidAgents: string[] = [];
      const agentsWithoutEmail: string[] = [];
      const validAgentIds: string[] = [];
      
      for (const agentId of agentIds) {
        const agentData = await db.get(`
          SELECT mr.agent_name, a.email
          FROM monthly_reports mr
          LEFT JOIN agents a ON mr.agent_id = a.agent_id
          WHERE mr.agent_id = ? AND mr.month = ? AND mr.year = ?
        `, [agentId, month, year]);
        
        if (!agentData) {
          invalidAgents.push(agentId);
        } else if (!agentData.email) {
          agentsWithoutEmail.push(agentId);
        } else {
          validAgentIds.push(agentId);
        }
      }
      
      if (invalidAgents.length > 0) {
        res.status(400).json({ 
          error: 'Some agents not found',
          invalidAgents,
          message: `${invalidAgents.length} agents not found for ${month}/${year}`
        });
        return;
      }
      
      if (preview) {
        // Return preview information
        const previewData = [];
        
        for (const agentId of validAgentIds.slice(0, 3)) { // Limit preview to 3 agents
          const agentData = await db.get(`
            SELECT mr.agent_name, a.email
            FROM monthly_reports mr
            LEFT JOIN agents a ON mr.agent_id = a.agent_id
            WHERE mr.agent_id = ? AND mr.month = ? AND mr.year = ?
          `, [agentId, month, year]);

          if (!agentData) {
            continue;
          }
          
          previewData.push({
            agentId,
            agentName: agentData.agent_name,
            email: agentData.email,
            subject: subjectTemplate || `Monthly Performance Report - ${this.getMonthName(month)} ${year}`
          });
        }
        
        res.json({
          preview: true,
          totalAgents: validAgentIds.length,
          agentsWithoutEmail,
          ccRecipients: ccValidation.recipients,
          previewData,
          estimatedTime: `${Math.ceil(validAgentIds.length / 20)} minutes` // Based on rate limit
        });
        return;
      }
      
      // Send bulk emails
      const result = await this.emailService.sendBulkEmails(
        validAgentIds,
        parseInt(month),
        parseInt(year),
        subjectTemplate,
        ccValidation.recipients
      );
      
      auditLog(
        username,
        'EMAIL_BULK_SEND',
        'email_history',
        'multiple',
        `Sent ${result.summary.sent} emails, failed ${result.summary.failed}`
      );
      
      res.json({
        success: result.success,
        summary: result.summary,
        results: result.results,
        agentsWithoutEmail,
        from: this.emailService.getConfig().senderAddress,
        ccRecipients: ccValidation.recipients,
        estimatedTime: `${Math.ceil(validAgentIds.length / 20)} minutes`
      });
    } catch (error) {
      logger.error('Send bulk emails error:', error);
      res.status(500).json({ 
        error: 'Failed to send bulk emails',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async getEmailHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { agentId, month, year, status, page = 1, limit = 20 } = req.query;
      
      let query = `
        SELECT 
          eh.*,
          a.full_name,
          a.email,
          edr.status as delivery_status,
          edr.delivered_at,
          edr.opened_at
        FROM email_history eh
        LEFT JOIN agents a ON eh.agent_id = a.agent_id
        LEFT JOIN email_delivery_reports edr ON eh.id = edr.email_history_id
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (agentId) {
        query += ' AND eh.agent_id = ?';
        params.push(agentId);
      }
      
      if (month) {
        query += ' AND eh.month = ?';
        params.push(parseInt(month as string));
      }
      
      if (year) {
        query += ' AND eh.year = ?';
        params.push(parseInt(year as string));
      }
      
      if (status) {
        query += ' AND eh.status = ?';
        params.push(status);
      }
      
      // Add pagination
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      query += ' ORDER BY eh.sent_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit as string), offset);
      
      const history = await db.all(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM email_history eh WHERE 1=1';
      const countParams: any[] = [];
      
      if (agentId) {
        countQuery += ' AND eh.agent_id = ?';
        countParams.push(agentId);
      }
      
      if (month) {
        countQuery += ' AND eh.month = ?';
        countParams.push(parseInt(month as string));
      }
      
      if (year) {
        countQuery += ' AND eh.year = ?';
        countParams.push(parseInt(year as string));
      }
      
      if (status) {
        countQuery += ' AND eh.status = ?';
        countParams.push(status);
      }
      
      const countResult = await db.get(countQuery, countParams) as { total?: number } | undefined;
      const total = Number(countResult?.total ?? 0);
      
      // Get summary statistics
      const summary = await db.get(`
        SELECT 
          COUNT(*) as total_emails,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
        FROM email_history
      `);
      
      res.json({
        history,
        summary,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error) {
      logger.error('Get email history error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch email history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async retryFailedEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { emailHistoryId } = req.params;
      const { ccRecipients } = req.body;
      const username = req.user?.username || 'unknown';
      const ccValidation = this.normalizeAndValidateCcRecipients(ccRecipients);

      if (!ccValidation.valid) {
        res.status(400).json({ error: ccValidation.error || 'Invalid CC recipients' });
        return;
      }

      // Get failed email details
      const failedEmail = await db.get(`
        SELECT 
          eh.*,
          a.email,
          a.full_name
        FROM email_history eh
        LEFT JOIN agents a ON eh.agent_id = a.agent_id
        WHERE eh.id = ? AND eh.status = 'failed'
      `, [emailHistoryId]);
      
      if (!failedEmail) {
        res.status(404).json({ 
          error: 'Failed email not found or already retried',
          message: 'Email may have been retried successfully or does not exist'
        });
        return;
      }
      
      // Regenerate email content
      const agentData = await db.get(`
        SELECT 
          mr.*,
          ac.comment
        FROM monthly_reports mr
        LEFT JOIN agent_comments ac ON mr.agent_id = ac.agent_id 
          AND mr.month = ac.month AND mr.year = ac.year
        WHERE mr.agent_id = ? AND mr.month = ? AND mr.year = ?
      `, [failedEmail.agent_id, failedEmail.month, failedEmail.year]);
      
      if (!agentData) {
        res.status(404).json({ error: 'Agent report data not found' });
        return;
      }
      
      const subject = `Monthly Performance Report - ${this.getMonthName(failedEmail.month)} ${failedEmail.year}`;
      const htmlBody = this.generateEmailHTML({
        agentName: failedEmail.full_name,
        month: failedEmail.month,
        year: failedEmail.year,
        totalHandleCalls: agentData.total_handle_calls,
        averageHandleTime: agentData.average_handle_time,
        agentUnavailableTimeHours: agentData.agent_unavailable_time_hours,
        refusedCalls: agentData.refused_calls,
        comment: agentData.comment,
        arfSeconds: agentData.arf_seconds,
        editTransferSeconds: agentData.edit_transfer_seconds,
        meetingSeconds: agentData.meeting_seconds,
        personalSeconds: agentData.personal_seconds,
        technicalIssueSeconds: agentData.technical_issue_seconds,
        trainingSeconds: agentData.training_seconds,
        lunchSeconds: agentData.lunch_seconds,
        totalSeconds: agentData.total_seconds
      });
      
      // Retry sending
      const result = await this.emailService.sendEmail({
        to: failedEmail.email,
        ccRecipients: ccValidation.recipients,
        subject,
        htmlBody,
        agentId: failedEmail.agent_id,
        month: failedEmail.month,
        year: failedEmail.year
      });
      
      if (result.success) {
        auditLog(
          username,
          'EMAIL_RETRY',
          'email_history',
          result.messageId,
          `Retried email to ${failedEmail.full_name}`
        );
        
        res.json({
          success: true,
          message: 'Email retried successfully',
          messageId: result.messageId
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to retry email',
          message: result.error
        });
      }
    } catch (error) {
      logger.error('Retry failed email error:', error);
      res.status(500).json({ 
        error: 'Failed to retry email',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async getEmailStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      
      const deliveryReport = await db.get(`
        SELECT 
          edr.*,
          eh.agent_id,
          eh.month,
          eh.year,
          a.full_name,
          a.email
        FROM email_delivery_reports edr
        JOIN email_history eh ON edr.email_history_id = eh.id
        LEFT JOIN agents a ON eh.agent_id = a.agent_id
        WHERE edr.message_id = ?
      `, [messageId]);
      
      if (!deliveryReport) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      
      res.json({
        messageId,
        status: deliveryReport.status,
        statusDetails: deliveryReport.status_details,
        sentAt: deliveryReport.created_at,
        deliveredAt: deliveryReport.delivered_at,
        openedAt: deliveryReport.opened_at,
        agentId: deliveryReport.agent_id,
        agentName: deliveryReport.full_name,
        email: deliveryReport.email,
        month: deliveryReport.month,
        year: deliveryReport.year
      });
    } catch (error) {
      logger.error('Get email status error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch email status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private generateEmailHTML(data: any): string {
    // Use the EmailService's template generator
    const monthName = this.getMonthName(data.month);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f4f4f4; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .header { background-color: #2c3e50; color: white; padding: 20px; text-align: center; border-radius: 5px; margin-bottom: 30px; }
        .section-title { background-color: #3498db; color: white; padding: 10px; margin: 20px 0 10px 0; border-radius: 3px; }
        .comment-box { background-color: #fff8dc; border-left: 4px solid #ffcc00; padding: 15px; margin: 20px 0; border-radius: 3px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Monthly Performance Report</h1>
        <h2>${monthName} ${data.year} - ${data.agentName}</h2>
    </div>
    
    <table>
        <thead><tr><th>Criteria</th><th>Unit</th><th>Value</th></tr></thead>
        <tbody>
            <tr><td>Total Handle Calls</td><td>#</td><td>${data.totalHandleCalls}</td></tr>
            <tr><td>Average Handle Time (AHT)</td><td>Minutes</td><td>${data.averageHandleTime}</td></tr>
            <tr><td>Agent Unavailable Time (AUT)</td><td>Hours</td><td>${data.agentUnavailableTimeHours.toFixed(4)}</td></tr>
            <tr><td>Refused Calls</td><td>%</td><td>${data.refusedCalls}</td></tr>
        </tbody>
    </table>
    
    <div class="section-title"><h3>AUT Breakdown</h3></div>
    
    <table>
        <thead><tr><th>Category</th><th>Unit</th><th>Value</th></tr></thead>
        <tbody>
            <tr><td>ARF</td><td>seconds</td><td>${data.arfSeconds}</td></tr>
            <tr><td>Edit & Transfer</td><td>seconds</td><td>${data.editTransferSeconds}</td></tr>
            <tr><td>Meeting</td><td>seconds</td><td>${data.meetingSeconds}</td></tr>
            <tr><td>Personal</td><td>seconds</td><td>${data.personalSeconds}</td></tr>
            <tr><td>Technical Issue</td><td>seconds</td><td>${data.technicalIssueSeconds}</td></tr>
            <tr><td>Training</td><td>seconds</td><td>${data.trainingSeconds}</td></tr>
            <tr><td>Lunch (above allotted time)</td><td>seconds</td><td>${data.lunchSeconds}</td></tr>
            <tr><td>Total</td><td>Hours</td><td>${(data.totalSeconds / 3600).toFixed(4)}</td></tr>
        </tbody>
    </table>
    
    ${data.comment ? `
    <div class="comment-box">
        <h3>Supervisor Comment:</h3>
        <p>${data.comment}</p>
    </div>
    ` : ''}
    
    <div class="footer">
        <p>This report was generated automatically. Please contact your supervisor if you have any questions.</p>
        <p>Report generated on: ${new Date().toLocaleDateString()}</p>
    </div>
</body>
</html>`;
  }

  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || '';
  }

  public getServiceConfig() {
    return this.emailService.getConfig();
  }

  private normalizeAndValidateCcRecipients(input: unknown): { valid: boolean; recipients: string[]; error?: string } {
    if (input === undefined || input === null) {
      return { valid: true, recipients: [] };
    }

    let rawValues: string[] = [];

    if (Array.isArray(input)) {
      rawValues = input.map(value => String(value));
    } else if (typeof input === 'string') {
      rawValues = input.split(/[,;\n]+/);
    } else {
      return { valid: false, recipients: [], error: 'CC recipients must be a string or array of emails' };
    }

    const recipients = rawValues
      .map(value => value.trim())
      .filter(Boolean);

    const uniqueRecipients = [...new Set(recipients.map(email => email.toLowerCase()))];
    const invalid = uniqueRecipients.find(email => !this.isValidEmail(email));

    if (invalid) {
      return { valid: false, recipients: [], error: `Invalid CC email address: ${invalid}` };
    }

    return { valid: true, recipients: uniqueRecipients };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
