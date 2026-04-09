import api from './api';

export interface UploadResponse {
  success: boolean;
  message: string;
  data: {
    agentsProcessed: number;
    month: number;
    year: number;
    summary: {
      totalAgents: number;
      totalHandleCalls: number;
      totalAUTHours: number;
      totalRefusedCalls: number;
      averageHandleTime: string;
      averageAUTPerAgent: number;
    };
  };
}

export interface DuplicateCheckResponse {
  exists: boolean;
  count: number;
  month: number;
  year: number;
}

export interface OverwriteResponse {
  success: boolean;
  message: string;
}

export const uploadService = {
  uploadFiles: async (
    agentSummaryFile: File,
    agentUnavailableFile: File,
    month: number,
    year: number,
    allowInProgressMonths = false
  ): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('agentSummary', agentSummaryFile);
    formData.append('agentUnavailable', agentUnavailableFile);
    formData.append('month', month.toString());
    formData.append('year', year.toString());
    formData.append('allowInProgressMonths', String(allowInProgressMonths));

    const response = await api.post<UploadResponse>('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  checkDuplicate: async (month: number, year: number): Promise<DuplicateCheckResponse> => {
    const response = await api.get<DuplicateCheckResponse>('/api/upload/check-duplicate', {
      params: { month, year }
    });
    return response.data;
  },

  overwriteData: async (month: number, year: number): Promise<OverwriteResponse> => {
    const response = await api.post<OverwriteResponse>('/api/upload/overwrite', {
      month,
      year
    });
    return response.data;
  },

  getUploadHistory: async (limit = 10, offset = 0) => {
    const response = await api.get('/api/upload/history', {
      params: { limit, offset }
    });
    return response.data;
  }
};

export default uploadService;
