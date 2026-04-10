import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { ClientSecretCredential } from '@azure/identity';
import { db } from '../../database/database';
import logger, { emailLog } from '../../utils/logger';

export interface EmailOptions {
  to: string;
  ccRecipients?: string[];
  subject: string;
  htmlBody: string;
  agentId: string;
  month: number;
  year: number;
}

export interface EmailTemplateData {
  agentName: string;
  month: number;
  year: number;
  totalHandleCalls: number;
  averageHandleTime: string;
  agentUnavailableTimeHours: number;
  refusedCalls: number;
  comment?: string;
  arfSeconds: number;
  editTransferSeconds: number;
  meetingSeconds: number;
  personalSeconds: number;
  technicalIssueSeconds: number;
  trainingSeconds: number;
  lunchSeconds: number;
  totalSeconds: number;
}

export class EmailService {
  private graphClient: Client | null = null;
  private isInitialized = false;
  private readonly rateLimit = parseInt(process.env.EMAIL_RATE_LIMIT || '20', 10);
  private readonly senderAddress = (process.env.MAIL_TARGET_ADDRESS || '').trim();

  constructor() {
    this.initialize().catch(err => {
      logger.error('Email service async initialization failed:', err);
    });
  }

  private async initialize(): Promise<void> {
    try {
      const clientId = process.env.AZURE_CLIENT_ID || '';
      const tenantId = process.env.AZURE_TENANT_ID || '';
      const clientSecret = process.env.AZURE_CLIENT_SECRET || '';

      if (!clientId || !tenantId || !clientSecret || !this.senderAddress) {
        logger.warn('Microsoft Graph email credentials or sender not fully configured. Email service is inactive.');
        return;
      }

      // We'll obtain the token manually to avoid @azure/identity network errors
      this.isInitialized = true;
      logger.info(`Email service ready for manual authentication (sender: ${this.senderAddress})`);
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.isInitialized = false;
    }
  }

  private async getAccessToken(): Promise<string> {
    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('client_id', clientId!);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('client_secret', clientSecret!);
    params.append('grant_type', 'client_credentials');

    const response = await fetch(url, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Azure Token Error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  }

  public getConfig(): {
    configured: boolean;
    mode: 'graph';
    senderAddress?: string;
    rateLimit: number;
    hasAzureConfig: boolean;
  } {
    return {
      configured: this.isConfigured(),
      mode: 'graph',
      senderAddress: this.senderAddress || undefined,
      rateLimit: this.rateLimit,
      hasAzureConfig: Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_SECRET)
    };
  }

  public isConfigured(): boolean {
    return Boolean(this.isInitialized && this.graphClient && this.senderAddress);
  }

  public async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isInitialized || !this.senderAddress) {
      return {
        success: false,
        error: 'Email service not configured. Check Azure credentials and sender mailbox.'
      };
    }

    const emailHistoryId = await this.logEmailAttempt(options);

    try {
      // Fetch token manually right before sending
      const accessToken = await this.getAccessToken();

      // Initialize client with the fresh manual token
      const client = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        }
      });

      const message = {
        subject: options.subject,
        body: {
          contentType: 'HTML',
          content: options.htmlBody
        },
        toRecipients: [
          {
            emailAddress: {
              address: options.to
            }
          }
        ],
        ccRecipients: (options.ccRecipients || []).map((address) => ({
          emailAddress: { address }
        }))
      };

      await client
        .api(`/users/${this.senderAddress}/sendMail`)
        .post({ message, saveToSentItems: true });

      const messageId = `graph-${Date.now()}-${options.agentId}`;

      await db.run(
        'UPDATE email_history SET status = ?, message_id = ? WHERE id = ?',
        ['sent', messageId, emailHistoryId]
      );

      await this.logDeliveryReport(emailHistoryId, options.agentId, messageId, 'sent');

      emailLog(
        options.agentId,
        messageId,
        'sent',
        `From: ${this.senderAddress}; To: ${options.to}; CC: ${(options.ccRecipients || []).join(', ')}`
      );

      return {
        success: true,
        messageId
      };
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : 'Unknown Graph API error';
      const errorMessage = this.normalizeGraphError(rawErrorMessage);

      logger.error('Email sending failed:', error);

      await db.run(
        'UPDATE email_history SET status = ?, error_message = ? WHERE id = ?',
        ['failed', errorMessage, emailHistoryId]
      );

      emailLog(options.agentId, 'failed', 'failed', errorMessage);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  public async sendBulkEmails(
    agentIds: string[],
    month: number,
    year: number,
    subjectTemplate: string | undefined,
    ccRecipients?: string[]
  ): Promise<{
    success: boolean;
    results: { agentId: string; success: boolean; messageId?: string; error?: string }[];
    summary: { total: number; sent: number; failed: number };
  }> {
    const results: { agentId: string; success: boolean; messageId?: string; error?: string }[] = [];
    let sentCount = 0;
    let failedCount = 0;

    const minIntervalMs = Math.ceil(60000 / Math.max(1, this.rateLimit));

    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i];

      try {
        const agentData = await this.getAgentEmailData(agentId, month, year);

        if (!agentData.email) {
          results.push({
            agentId,
            success: false,
            error: 'Agent has no email address'
          });
          failedCount++;
          continue;
        }

        const subject = subjectTemplate || `Monthly Performance Report - ${this.getMonthName(month)} ${year}`;
        const htmlBody = this.generateEmailHTML(agentData);

        const result = await this.sendEmail({
          to: agentData.email,
          ccRecipients,
          subject,
          htmlBody,
          agentId,
          month,
          year
        });

        results.push({
          agentId,
          success: result.success,
          messageId: result.messageId,
          error: result.error
        });

        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        results.push({
          agentId,
          success: false,
          error: errorMessage
        });
        failedCount++;
        logger.error(`Failed to send email to agent ${agentId}:`, error);
      }

      if (i < agentIds.length - 1) {
        await this.delay(minIntervalMs);
      }
    }

    return {
      success: sentCount > 0,
      results,
      summary: {
        total: agentIds.length,
        sent: sentCount,
        failed: failedCount
      }
    };
  }

  private async getAgentEmailData(agentId: string, month: number, year: number): Promise<EmailTemplateData & { email?: string }> {
    const data = await db.get(
      `
      SELECT
        mr.*,
        a.email,
        ac.comment
      FROM monthly_reports mr
      LEFT JOIN agents a ON mr.agent_id = a.agent_id
      LEFT JOIN agent_comments ac ON mr.agent_id = ac.agent_id
        AND mr.month = ac.month AND mr.year = ac.year
      WHERE mr.agent_id = ? AND mr.month = ? AND mr.year = ?
      `,
      [agentId, month, year]
    );

    if (!data) {
      throw new Error(`No data found for agent ${agentId} in ${month}/${year}`);
    }

    return {
      agentName: data.agent_name,
      month: data.month,
      year: data.year,
      totalHandleCalls: this.safeNumber(data.total_handle_calls),
      averageHandleTime: data.average_handle_time || '00:00',
      agentUnavailableTimeHours: this.safeNumber(data.agent_unavailable_time_hours),
      refusedCalls: this.safeNumber(data.refused_calls),
      comment: data.comment,
      arfSeconds: this.safeNumber(data.arf_seconds),
      editTransferSeconds: this.safeNumber(data.edit_transfer_seconds),
      meetingSeconds: this.safeNumber(data.meeting_seconds),
      personalSeconds: this.safeNumber(data.personal_seconds),
      technicalIssueSeconds: this.safeNumber(data.technical_issue_seconds),
      trainingSeconds: this.safeNumber(data.training_seconds),
      lunchSeconds: this.safeNumber(data.lunch_seconds),
      totalSeconds: this.safeNumber(data.total_seconds),
      email: data.email
    };
  }

  private generateEmailHTML(data: EmailTemplateData): string {
    const monthName = this.getMonthName(data.month);

    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #f4f4f4;
            font-weight: bold;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .header {
            background-color: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px;
            margin-bottom: 30px;
        }
        .section-title {
            background-color: #3498db;
            color: white;
            padding: 10px;
            margin: 20px 0 10px 0;
            border-radius: 3px;
        }
        .comment-box {
            background-color: #fff8dc;
            border-left: 4px solid #ffcc00;
            padding: 15px;
            margin: 20px 0;
            border-radius: 3px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Monthly Performance Report</h1>
        <h2>${monthName} ${data.year} - ${data.agentName}</h2>
    </div>

    <table>
        <thead>
            <tr>
                <th>Criteria</th>
                <th>Unit</th>
                <th>Value</th>
            </tr>
        </thead>
        <tbody>
            <tr><td>Total Handle Calls</td><td>#</td><td>${data.totalHandleCalls}</td></tr>
            <tr><td>Average Handle Time (AHT)</td><td>Minutes</td><td>${data.averageHandleTime}</td></tr>
            <tr><td>Agent Unavailable Time (AUT)</td><td>Hours</td><td>${data.agentUnavailableTimeHours.toFixed(4)}</td></tr>
            <tr><td>Refused Calls</td><td>%</td><td>${data.refusedCalls}</td></tr>
        </tbody>
    </table>

    <div class="section-title">
        <h3>AUT Breakdown</h3>
    </div>

    <table>
        <thead>
            <tr>
                <th>Category</th>
                <th>Unit</th>
                <th>Value</th>
            </tr>
        </thead>
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

  private async logEmailAttempt(options: EmailOptions): Promise<number> {
    const result = await db.run(
      `INSERT INTO email_history (agent_id, month, year, status)
       VALUES (?, ?, ?, 'pending')`,
      [options.agentId, options.month, options.year]
    );

    return result.lastID;
  }

  private async logDeliveryReport(
    emailHistoryId: number,
    agentId: string,
    messageId: string,
    status: string
  ): Promise<void> {
    await db.run(
      `INSERT INTO email_delivery_reports (email_history_id, agent_id, message_id, status)
       VALUES (?, ?, ?, ?)`,
      [emailHistoryId, agentId, messageId, status]
    );
  }

  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || '';
  }

  private safeNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private normalizeGraphError(errorMessage: string): string {
    const message = errorMessage || 'Unknown Graph API error';
    const lower = message.toLowerCase();

    if (lower.includes('insufficient privileges') || lower.includes('access is denied')) {
      return 'Graph API permission issue. Ensure Mail.Send application permission is granted with admin consent and sender mailbox access is allowed.';
    }

    if (lower.includes('resource could not be discovered') || lower.includes('resource not found')) {
      return `Sender mailbox not found or inaccessible: ${this.senderAddress}. Verify MAIL_TARGET_ADDRESS and mailbox existence.`;
    }

    if (lower.includes('invalid_client') || lower.includes('unauthorized_client') || lower.includes('aadsts')) {
      return 'Azure AD authentication failed. Verify AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET.';
    }

    return message;
  }
}
