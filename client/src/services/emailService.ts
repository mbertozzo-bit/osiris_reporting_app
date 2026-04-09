import api from './api';

export interface EmailPreview {
  preview: boolean;
  to: string;
  ccRecipients?: string[];
  subject: string;
  htmlBody: string;
  agentName: string;
  month: number;
  year: number;
}

export interface EmailSendResponse {
  success: boolean;
  message: string;
  messageId?: string;
  from?: string;
  to: string;
  ccRecipients?: string[];
  agentName: string;
}

export interface BulkEmailResult {
  agentId: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BulkEmailResponse {
  success: boolean;
  results: BulkEmailResult[];
  summary: {
    total: number;
    sent: number;
    failed: number;
  };
  agentsWithoutEmail: string[];
  from?: string;
  ccRecipients?: string[];
  estimatedTime: string;
}

export interface EmailHistoryRecord {
  id: number;
  agent_id: string;
  month: number;
  year: number;
  sent_at: string;
  status: 'pending' | 'sent' | 'failed';
  error_message?: string;
  message_id?: string;
  full_name?: string;
  email?: string;
  delivery_status?: string;
  delivered_at?: string;
  opened_at?: string;
}

export interface EmailHistoryResponse {
  history: EmailHistoryRecord[];
  summary: {
    total_emails: number;
    sent_count: number;
    failed_count: number;
    pending_count: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface EmailConfig {
  configured: boolean;
  mode: 'graph';
  senderAddress?: string;
  rateLimit: number;
  hasAzureConfig: boolean;
}

export const emailService = {
  sendAgentEmail: async (
    agentId: string,
    month: number,
    year: number,
    subject?: string,
    preview = false,
    ccRecipients?: string[]
  ): Promise<EmailPreview | EmailSendResponse> => {
    const response = await api.post('/api/email/send', {
      agentId,
      month,
      year,
      subject,
      preview,
      ccRecipients
    });
    return response.data;
  },

  sendBulkEmails: async (
    agentIds: string[],
    month: number,
    year: number,
    subjectTemplate?: string,
    preview = false,
    ccRecipients?: string[]
  ): Promise<BulkEmailResponse> => {
    const response = await api.post('/api/email/send-bulk', {
      agentIds,
      month,
      year,
      subjectTemplate,
      preview,
      ccRecipients
    });
    return response.data;
  },

  getEmailHistory: async (
    agentId?: string,
    month?: number,
    year?: number,
    status?: string,
    page = 1,
    limit = 20
  ): Promise<EmailHistoryResponse> => {
    const response = await api.get('/api/email/history', {
      params: { agentId, month, year, status, page, limit }
    });
    return response.data;
  },

  retryFailedEmail: async (
    emailHistoryId: number,
    ccRecipients?: string[]
  ) => {
    const response = await api.post(`/api/email/retry/${emailHistoryId}`, {
      ccRecipients
    });
    return response.data;
  },

  getEmailStatus: async (messageId: string) => {
    const response = await api.get(`/api/email/status/${messageId}`);
    return response.data;
  },

  getConfig: async (): Promise<EmailConfig> => {
    const response = await api.get('/api/email/config');
    return response.data;
  }
};

export default emailService;
