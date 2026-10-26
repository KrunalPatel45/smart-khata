import axios from 'axios';

const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
  },
  timeout: 15000,
});

export async function initializeCsrf() {
  await api.get('/sanctum/csrf-cookie');
}

export default api;