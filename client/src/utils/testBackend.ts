import api from '../services/api';

export async function testBackendConnection() {
  try {
    const response = await api.get('/api/health');
    console.log('Backend health check:', response.data);
    return response.data;
  } catch (error) {
    console.error('Backend connection failed:', error);
    throw error;
  }
}