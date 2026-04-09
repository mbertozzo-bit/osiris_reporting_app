import api from './api';

export interface Agent {
  id?: number;
  agent_id: string;
  full_name: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  report_count?: number;
  latest_report?: string;
}

export interface AgentDetails extends Agent {
  reportHistory?: Array<{
    month: number;
    year: number;
    total_handle_calls: number;
    agent_unavailable_time_hours: number;
    refused_calls: number;
  }>;
  latestComment?: {
    comment: string;
    month: number;
    year: number;
  };
}

export interface AgentResponse {
  agents: Agent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BulkUpdateResult {
  success: boolean;
  message: string;
  updatedCount: number;
  totalProcessed: number;
  errors?: string[];
}

export const agentService = {
  getAgents: async (
    page = 1,
    limit = 20,
    search?: string,
    sortBy = 'full_name',
    sortOrder = 'asc'
  ): Promise<AgentResponse> => {
    const response = await api.get<AgentResponse>('/api/agents', {
      params: { page, limit, search, sortBy, sortOrder }
    });
    return response.data;
  },

  getAgent: async (agentId: string): Promise<AgentDetails> => {
    const response = await api.get<AgentDetails>(`/api/agents/${agentId}`);
    return response.data;
  },

  createAgent: async (agent: Omit<Agent, 'id' | 'created_at' | 'updated_at'>) => {
    const response = await api.post('/api/agents', agent);
    return response.data;
  },

  updateAgent: async (agentId: string, updates: Partial<Agent>) => {
    const response = await api.put(`/api/agents/${agentId}`, updates);
    return response.data;
  },

  deleteAgent: async (agentId: string) => {
    const response = await api.delete(`/api/agents/${agentId}`);
    return response.data;
  },

  bulkUpdateAgents: async (agents: Array<Partial<Agent>>): Promise<BulkUpdateResult> => {
    const response = await api.post<BulkUpdateResult>('/api/agents/bulk-update', { agents });
    return response.data;
  },

  exportAgents: async (format: 'json' | 'csv' = 'json') => {
    const response = await api.get(`/api/agents/export/agents?format=${format}`, {
      responseType: format === 'csv' ? 'blob' : 'json'
    });
    return response.data;
  },

  syncFromReports: async () => {
    const response = await api.post('/api/agents/sync-from-reports');
    return response.data;
  },

  importAgents: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/api/agents/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }
};

export default agentService;