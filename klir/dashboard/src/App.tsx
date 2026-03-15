import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { connect, disconnect } from "@/api/ws";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/views/Login";
import Layout from "@/components/Layout";
import Overview from "@/views/Overview";
import Sessions from "@/views/Sessions";
import MessageThread from "@/views/MessageThread";
import NamedSessions from "@/views/NamedSessions";
import Agents from "@/views/Agents";
import Cron from "@/views/Cron";
import Tasks from "@/views/Tasks";
import Processes from "@/views/Processes";

function AuthenticatedApp() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) connect();
    return () => disconnect();
  }, [token]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="sessions/:chatId" element={<MessageThread />} />
        <Route path="named-sessions" element={<NamedSessions />} />
        <Route path="agents" element={<Agents />} />
        <Route path="cron" element={<Cron />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="processes" element={<Processes />} />
      </Route>
    </Routes>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AuthenticatedApp />
            </RequireAuth>
          }
        />
      </Routes>
      <Toaster />
    </>
  );
}
