import {
  createContext, useContext, useEffect,
  useState, useCallback
} from 'react';
import api, { initializeCsrf } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/me');
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    await initializeCsrf();

    const { data } = await api.post('/api/v1/login', {
      email,
      password,
    });

    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await api.post('/api/v1/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be inside AuthProvider');
  }

  return context;
}