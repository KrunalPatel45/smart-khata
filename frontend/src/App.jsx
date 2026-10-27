import { useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';

import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  LogOut,
  Menu,
  X,
  Wallet,
  Mic,
  ChartNoAxesColumn,
} from 'lucide-react';

import { useAuth } from './context/AuthContext';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import TransactionsPage from './pages/TransactionsPage';
import VoiceEntryPage from './pages/VoiceEntryPage';
import ReportsPage from './pages/ReportsPage';

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">
          Loading Smart Khata...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">
          Loading Smart Khata...
        </p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

function DashboardLayout({ language, setLanguage }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const gu = language === 'gu';

  const menuItems = [
    {
      path: '/dashboard',
      label: gu ? 'ડેશબોર્ડ' : 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      path: '/customers',
      label: gu ? 'ગ્રાહકો' : 'Customers',
      icon: Users,
    },
    {
      path: '/voice',
      label: gu ? 'વૉઇસ' : 'Voice',
      icon: Mic,
    },
    {
      path: '/reports',
      label: gu ? 'રિપોર્ટ' : 'Reports',
      icon: ChartNoAxesColumn,
    },
    {
      path: '/transactions',
      label: gu ? 'ઉધાર / જમા' : 'Transactions',
      icon: ArrowLeftRight,
    },
  ];

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  const navigation = (
    <nav className="space-y-1">
      {menuItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-xl px-4 py-3',
                'font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100',
              ].join(' ')
            }
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-clip">

      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">

        <div className="h-16 px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2">

          <div className="flex items-center gap-3">

            <button
              type="button"
              onClick={() => setMobileMenuOpen((value) => !value)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X size={23} />
              ) : (
                <Menu size={23} />
              )}
            </button>

            <div className="flex items-center gap-2">

              <div className="bg-blue-600 text-white rounded-xl p-2">
                <Wallet size={21} />
              </div>

              <span className="font-bold text-lg text-slate-900">
                Smart Khata
              </span>

            </div>

          </div>

          <div className="flex items-center gap-3">

            <select
              aria-label="Select language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-2 bg-white text-sm"
            >
              <option value="gu">ગુજરાતી</option>
              <option value="en">English</option>
            </select>

            <span className="hidden sm:block text-sm text-slate-600">
              {user?.name || user?.email}
            </span>

            <button
              type="button"
              disabled={loggingOut}
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
            >
              <LogOut size={17} />

              <span className="hidden sm:inline">
                {loggingOut
                  ? (gu ? 'થોડી રાહ જુઓ...' : 'Logging out...')
                  : (gu ? 'લૉગઆઉટ' : 'Logout')}
              </span>
            </button>

          </div>

        </div>

      </header>

      <div className="flex">

        <aside className="hidden lg:block w-64 min-h-[calc(100vh-4rem)] bg-white border-r border-slate-200 p-4">
          {navigation}
        </aside>

        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 top-16 z-20 bg-black/40">

            <div className="w-72 max-w-[85%] h-full bg-white p-4 shadow-lg">
              {navigation}
            </div>

          </div>
        )}

        <main className="flex-1 min-w-0 w-full p-3 sm:p-4 md:p-6 pb-28 lg:pb-6">
          <Outlet context={{ language }} />
        </main>

      </div>

      <nav aria-label={gu ? 'મોબાઇલ નેવિગેશન' : 'Mobile navigation'} className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-lg pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 gap-0 max-w-xl mx-auto">
          {[
            { path: '/dashboard', label: gu ? 'હોમ' : 'Home', icon: LayoutDashboard },
            { path: '/customers', label: gu ? 'ગ્રાહકો' : 'Customers', icon: Users },
            { path: '/voice', label: gu ? 'વૉઇસ' : 'Voice', icon: Mic },
            { path: '/transactions', label: gu ? 'એન્ટ્રી' : 'Entries', icon: ArrowLeftRight },
            { path: '/reports', label: gu ? 'રિપોર્ટ' : 'Reports', icon: ChartNoAxesColumn },
          ].map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) =>
              'flex min-w-0 flex-col items-center justify-center gap-1 py-3 px-0.5 text-[10px] font-semibold ' +
              (isActive ? 'text-blue-700 bg-blue-50' : 'text-slate-500')
            }>
              <Icon size={21} aria-hidden="true" />
              <span className="truncate max-w-full">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('smart_khata_language') || 'gu';
  });

  const changeLanguage = (value) => {
    setLanguage(value);
    localStorage.setItem('smart_khata_language', value);
  };

  return (
    <BrowserRouter>
      <Routes>

        <Route element={<GuestRoute />}>
          <Route
            path="/login"
            element={<LoginPage />}
          />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route
            element={
              <DashboardLayout
                language={language}
                setLanguage={changeLanguage}
              />
            }
          >

            <Route
              path="/dashboard"
              element={<DashboardPage language={language} />}
            />

            <Route
              path="/customers"
              element={<CustomersPage language={language} />}
            />

            <Route path="/voice" element={<VoiceEntryPage language={language} />} />
            <Route path="/reports" element={<ReportsPage language={language} />} />
            <Route
              path="/transactions"
              element={<TransactionsPage language={language} />}
            />

          </Route>
        </Route>

        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />

        <Route
          path="*"
          element={<Navigate to="/dashboard" replace />}
        />

      </Routes>
    </BrowserRouter>
  );
}