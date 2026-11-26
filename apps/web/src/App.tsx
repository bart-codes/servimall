import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import Admin from './pages/Admin';
import Auth from './pages/Auth';
import Forgot from './pages/Forgot';
import Home from './pages/Home';
import MyBookings from './pages/MyBookings';
import Owner from './pages/Owner';
import Shop from './pages/Shop';
import Terms from './pages/Terms';

function Protected({ roles }: { roles?: ('customer' | 'owner' | 'admin')[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="shop/:slug" element={<Shop />} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="register" element={<Auth mode="register" />} />
        <Route path="forgot" element={<Forgot />} />
        <Route path="terms" element={<Terms />} />
        <Route element={<Protected />}>
          <Route path="bookings" element={<MyBookings />} />
          {/* any signed-in user can open a shop; creating one makes them an owner */}
          <Route path="owner" element={<Owner />} />
        </Route>
        <Route element={<Protected roles={['admin']} />}>
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
