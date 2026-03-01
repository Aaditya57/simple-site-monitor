import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { useAuthStore } from "@/lib/authStore";
import { User } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";

// Pages
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import VerifyEmailPending from "@/pages/VerifyEmailPending";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PendingApproval from "@/pages/PendingApproval";
import AccountSuspended from "@/pages/AccountSuspended";
import Dashboard from "@/pages/Dashboard";
import MonitorDetail from "@/pages/MonitorDetail";
import MonitorNew from "@/pages/MonitorNew";
import MonitorEdit from "@/pages/MonitorEdit";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/NotFound";

export default function App() {
  const { setAuth, clearAuth } = useAuthStore();

  useEffect(() => {
    // Restore session from httpOnly cookie on page load
    axios
      .post<{ accessToken: string; user: User }>(
        "/api/auth/refresh",
        {},
        { withCredentials: true }
      )
      .then(({ data }) => setAuth(data.user, data.accessToken))
      .catch(() => clearAuth());
  }, [setAuth, clearAuth]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email-pending" element={<VerifyEmailPending />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/suspended" element={<AccountSuspended />} />

        {/* Protected (approved users) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/monitors/new" element={<MonitorNew />} />
          <Route path="/monitors/:id" element={<MonitorDetail />} />
          <Route path="/monitors/:id/edit" element={<MonitorEdit />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Admin only */}
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
