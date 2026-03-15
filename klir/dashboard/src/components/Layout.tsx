import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useDashboardStore } from "@/store/dashboard";
import { useAuthStore } from "@/store/auth";
import ConnectionBanner from "@/components/ConnectionBanner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: "\u25C9" },
  { to: "/sessions", label: "Sessions", icon: "\u25CE" },
  { to: "/named-sessions", label: "Named", icon: "\u25C8" },
  { to: "/agents", label: "Agents", icon: "\u25C6" },
  { to: "/cron", label: "Cron", icon: "\u25F7" },
  { to: "/tasks", label: "Tasks", icon: "\u25E7" },
  { to: "/processes", label: "Processes", icon: "\u25EB" },
] as const;

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const connected = useDashboardStore((s) => s.connected);
  const clearToken = useAuthStore((s) => s.clearToken);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r bg-card transition-all",
          collapsed ? "w-14" : "w-48",
        )}
      >
        <div className="flex items-center gap-2 border-b px-3 py-3">
          {!collapsed && <span className="text-sm font-bold">klir</span>}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "\u2192" : "\u2190"}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )
              }
            >
              <span className="w-5 text-center">{icon}</span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-green-500" : "bg-red-500",
              )}
            />
            {!collapsed && (
              <span className="text-xs text-muted-foreground">
                {connected ? "Connected" : "Disconnected"}
              </span>
            )}
          </div>
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-xs"
              onClick={clearToken}
            >
              Logout
            </Button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <ConnectionBanner />
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
