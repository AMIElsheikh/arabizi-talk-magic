import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, ListChecks, FileSpreadsheet, GitCompare, LogOut, Wallet, Settings, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/employees", label: "الموظفين", icon: Users },
  { to: "/components", label: "بنود المرتب", icon: ListChecks },
  { to: "/payroll", label: "إدخال المرتبات", icon: FileSpreadsheet },
  { to: "/compare", label: "المقارنة الشهرية", icon: GitCompare },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  }

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col p-4 shrink-0">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground p-2 rounded-lg">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm">نظام المرتبات</div>
            <div className="text-xs opacity-70">الموارد البشرية</div>
          </div>
        </div>
        <nav className="space-y-1 flex-1">
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "hover:bg-sidebar-accent text-sidebar-foreground/80"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border pt-3 mt-3">
          <div className="px-3 py-2 text-xs opacity-70 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={logout}>
            <LogOut className="w-4 h-4 ml-2" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
