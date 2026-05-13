import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Users,
  ListChecks,
  FileSpreadsheet,
  GitCompare,
  LogOut,
  Wallet,
  Settings,
  Building2,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/employees", label: "الموظفين", icon: Users },
  { to: "/departments", label: "الأقسام", icon: Building2 },
  { to: "/components", label: "بنود المرتب", icon: ListChecks },
  { to: "/payroll", label: "إدخال المرتبات", icon: FileSpreadsheet },
  { to: "/compare", label: "المقارنة الشهرية", icon: GitCompare },
  { to: "/settings", label: "الإعدادات", icon: Settings },
];

// Bottom-bar shortcuts on mobile (most-used 5)
const bottomNav = [
  { to: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/employees", label: "الموظفين", icon: Users },
  { to: "/payroll", label: "المرتبات", icon: FileSpreadsheet },
  { to: "/compare", label: "المقارنة", icon: GitCompare },
];

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Close drawer when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  }

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const SidebarContent = (
    <>
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
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-sidebar text-sidebar-foreground flex-col p-4 shrink-0">
        {SidebarContent}
      </aside>

      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-4 h-14 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="bg-sidebar-primary text-sidebar-primary-foreground p-1.5 rounded-md">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">نظام المرتبات</div>
          </div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-sidebar text-sidebar-foreground border-sidebar-border p-4 flex flex-col">
              {SidebarContent}
            </SheetContent>
          </Sheet>
        </header>

        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar text-sidebar-foreground border-t border-sidebar-border grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {bottomNav.map((item) => {
          const active = location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors",
                active ? "text-sidebar-primary-foreground bg-sidebar-primary/80" : "text-sidebar-foreground/80"
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
