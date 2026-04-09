import api from './api';

export interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    username: string;
  };
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export const authService = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/api/auth/login', {
      username,
      password
    });
    return response.data;
  },

  logout: async (): Promise<void> => {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  validateToken: async (): Promise<boolean> => {
    try {
      await api.get('/api/auth/validate');
      return true;
    } catch (error) {
      return false;
    }
  },

  getCurrentUser: () => {
    const userStr = localStorage.getItem('auth_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getToken: () => {
    return localStorage.getItem('auth_token');
  },

  isAuthenticated: () => {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    return !!(token && user);
  }
};

export default authService;