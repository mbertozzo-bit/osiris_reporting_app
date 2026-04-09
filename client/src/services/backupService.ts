import api from './api';

export interface BackupFile {
  filename: string;
  size: number;
  created: string;
  formattedSize: string;
  formattedDate: string;
}

export interface BackupStats {
  totalBackups: number;
  totalSize: number;
  formattedTotalSize: string;
  oldestBackup?: string;
  newestBackup?: string;
  backupsByDay: Array<{
    date: string;
    count: number;
    totalSize: number;
  }>;
}

export interface BackupCreateResponse {
  success: boolean;
  message: string;
  backupFile?: string;
  error?: string;
}

export interface BackupRestoreResponse {
  success: boolean;
  error?: string;
}

export interface BackupVerifyResponse {
  success: boolean;
  error?: string;
  details?: {
    size: number;
    created: string;
    isValid: boolean;
  };
}

export interface BackupListResponse {
  backups: BackupFile[];
  stats: BackupStats;
}

export const backupService = {
  createBackup: async (): Promise<BackupCreateResponse> => {
    const response = await api.post<BackupCreateResponse>('/api/backup/create');
    return response.data;
  },

  listBackups: async (): Promise<BackupListResponse> => {
    const response = await api.get<BackupListResponse>('/api/backup/list');
    return response.data;
  },

  restoreBackup: async (backupFileName: string, confirm: boolean): Promise<BackupRestoreResponse> => {
    const response = await api.post<BackupRestoreResponse>(`/api/backup/restore/${backupFileName}`, {
      confirm
    });
    return response.data;
  },

  getBackupStats: async (): Promise<BackupStats> => {
    const response = await api.get<BackupStats>('/api/backup/stats');
    return response.data;
  },

  verifyBackup: async (backupFileName: string): Promise<BackupVerifyResponse> => {
    const response = await api.get<BackupVerifyResponse>(`/api/backup/verify/${backupFileName}`);
    return response.data;
  },

  deleteBackup: async (backupFileName: string, confirm: boolean) => {
    const response = await api.delete(`/api/backup/${backupFileName}`, {
      data: { confirm }
    });
    return response.data;
  },

  cleanupBackups: async () => {
    const response = await api.post('/api/backup/cleanup');
    return response.data;
  }
};

export default backupService;