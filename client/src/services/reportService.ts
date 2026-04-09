import api from './api';

export interface Report {
  id: number;
  month: number;
  year: number;
  agent_id: string;
  agent_name: string;
  total_handle_calls: number | null;
  average_handle_time: string | null;
  agent_unavailable_time_hours: number | null;
  escalation_rate?: number | null;
  call_quality_score?: number | null;
  schedule_adherence?: number | null;
  refused_calls: number | null;
  arf_seconds?: number | null;
  correcting_repost_seconds?: number | null;
  edit_transfer_seconds?: number | null;
  emails_seconds?: number | null;
  faxes_seconds?: number | null;
  meeting_seconds?: number | null;
  misc_seconds?: number | null;
  payment_plan_seconds?: number | null;
  personal_seconds?: number | null;
  printing_log_seconds?: number | null;
  statements_seconds?: number | null;
  task_seconds?: number | null;
  technical_issue_seconds?: number | null;
  training_seconds?: number | null;
  vms_seconds?: number | null;
  wrap_up_seconds?: number | null;
  break_seconds?: number | null;
  lunch_seconds?: number | null;
  total_seconds?: number | null;
  email?: string;
  comment?: string;
}

export interface ReportSummary {
  month: number;
  year: number;
  totalAgents: number;
  totalHandleCalls: number;
  totalAUTSeconds: number;
  totalAUTHours: number;
  averageHandleTime: string;
  totalRefusedCalls: number;
}

export interface TimeSeriesData {
  agentId: string;
  criteria: string;
  timeSeries: Array<{
    date: string;
    month: number;
    year: number;
    value: number;
    agentName: string;
  }>;
}

export interface AvailableMonth {
  month: number;
  year: number;
}

export interface AgentInfo {
  agent_id: string;
  agent_name: string;
  email?: string;
  report_count: number;
}

export interface ManagedReportUpdatePayload {
  total_handle_calls?: number | null;
  average_handle_time?: string | null;
  agent_unavailable_time_hours?: number | null;
  escalation_rate?: number | null;
  call_quality_score?: number | null;
  schedule_adherence?: number | null;
  refused_calls?: number | null;
  arf_seconds?: number | null;
  correcting_repost_seconds?: number | null;
  edit_transfer_seconds?: number | null;
  emails_seconds?: number | null;
  faxes_seconds?: number | null;
  meeting_seconds?: number | null;
  misc_seconds?: number | null;
  payment_plan_seconds?: number | null;
  personal_seconds?: number | null;
  printing_log_seconds?: number | null;
  statements_seconds?: number | null;
  task_seconds?: number | null;
  technical_issue_seconds?: number | null;
  training_seconds?: number | null;
  vms_seconds?: number | null;
  wrap_up_seconds?: number | null;
  break_seconds?: number | null;
  lunch_seconds?: number | null;
  total_seconds?: number | null;
}

export const reportService = {
  getReports: async (
    month?: number,
    year?: number,
    agentId?: string,
    page = 1,
    limit = 20
  ) => {
    const response = await api.get('/api/reports', {
      params: { month, year, agentId, page, limit }
    });
    return response.data;
  },

  getReportSummary: async (month: number, year: number): Promise<ReportSummary> => {
    const response = await api.get<ReportSummary>('/api/reports/summary', {
      params: { month, year }
    });
    return response.data;
  },

  getAgentTimeSeries: async (
    agentId: string,
    criteria?: string
  ): Promise<TimeSeriesData> => {
    const response = await api.get<TimeSeriesData>('/api/reports/time-series', {
      params: { agentId, criteria }
    });
    return response.data;
  },

  updateAgentComment: async (
    agentId: string,
    month: number,
    year: number,
    comment: string
  ) => {
    const response = await api.post('/api/reports/comments', {
      agentId,
      month,
      year,
      comment
    });
    return response.data;
  },

  getAvailableMonths: async (): Promise<AvailableMonth[]> => {
    const response = await api.get<{ months: AvailableMonth[] }>('/api/reports/available-months');
    return response.data.months;
  },

  getAgentList: async (search?: string, month?: number, year?: number): Promise<AgentInfo[]> => {
    const response = await api.get<{ agents: AgentInfo[] }>('/api/reports/agents', {
      params: { search, month, year }
    });
    return response.data.agents;
  },

  exportReports: async (month: number, year: number, format: 'json' | 'csv' = 'json') => {
    const response = await api.get(`/api/reports/export?month=${month}&year=${year}&format=${format}`, {
      responseType: format === 'csv' ? 'blob' : 'json'
    });
    return response.data;
  },

  getAgentReport: async (agentId: string, month?: number, year?: number) => {
    const response = await api.get(`/api/reports/agent/${agentId}`, {
      params: { month, year }
    });
    return response.data;
  },

  updateManagedReport: async (
    agentId: string,
    month: number,
    year: number,
    reportData: ManagedReportUpdatePayload,
    comment: string
  ) => {
    const response = await api.put('/api/reports/manage', {
      agentId,
      month,
      year,
      reportData,
      comment
    });
    return response.data;
  },

  deleteManagedReport: async (agentId: string, month: number, year: number) => {
    const response = await api.delete(`/api/reports/manage/${agentId}`, {
      params: { month, year }
    });
    return response.data;
  }
};

export default reportService;
