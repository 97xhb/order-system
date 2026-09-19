import axios from 'axios';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { http } from '../lib/http';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
}

interface AuthResponse {
  user: AdminUser;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AdminUser | null>(null);
  const initialized = ref(false);
  const loading = ref(false);

  const loadCurrentUser = async (force = false) => {
    if (initialized.value && !force) return Boolean(user.value);

    loading.value = true;
    try {
      const response = await http.get<AuthResponse>('/auth/me');
      user.value = response.data.user;
      return true;
    } catch (error) {
      user.value = null;
      if (!axios.isAxiosError(error) || error.response?.status !== 401) {
        throw error;
      }
      return false;
    } finally {
      initialized.value = true;
      loading.value = false;
    }
  };

  const login = async (username: string, password: string) => {
    loading.value = true;
    try {
      const response = await http.post<AuthResponse>('/auth/login', {
        username,
        password,
      });
      user.value = response.data.user;
      initialized.value = true;
    } finally {
      loading.value = false;
    }
  };

  const logout = async () => {
    try {
      await http.post('/auth/logout');
    } finally {
      user.value = null;
      initialized.value = true;
    }
  };

  return { user, initialized, loading, loadCurrentUser, login, logout };
});
