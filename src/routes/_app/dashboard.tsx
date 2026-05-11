import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileSpreadsheet, ListChecks, TrendingUp } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [emp, comp, rec] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("salary_components").select("id", { count: "exact", head: true }),
        supabase.from("salary_records").select("net_salary"),
      ]);
      const total = (rec.data || []).reduce((s, r) => s + Number(r.net_salary || 0), 0);
      return {
        employees: emp.count || 0,
        components: comp.count || 0,
        records: rec.data?.length || 0,
        total,
      };
    },
  });

  const cards = [
    { label: "الموظفين النشطين", value: stats?.employees ?? "-", icon: Users, color: "text-primary" },
    { label: "بنود المرتب", value: stats?.components ?? "-", icon: ListChecks, color: "text-success" },
    { label: "سجلات المرتبات", value: stats?.records ?? "-", icon: FileSpreadsheet, color: "text-warning" },
    { label: "إجمالي الصافي", value: stats ? stats.total.toLocaleString("ar-EG") + " ج.م" : "-", icon: TrendingUp, color: "text-accent-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">مرحبا بك 👋</h1>
        <p className="text-muted-foreground mt-1">نظرة عامة على بيانات المرتبات</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{c.label}</p>
                    <p className="text-2xl font-bold mt-1">{c.value}</p>
                  </div>
                  <div className={`bg-secondary p-3 rounded-xl ${c.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>ابدأ من هنا</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <QuickLink to="/employees" title="١. أضف الموظفين" desc="ابدأ بإضافة بيانات الموظفين" />
          <QuickLink to="/components" title="٢. عرّف بنود المرتب" desc="مرتب أساسي، حافز، بدلات، خصومات..." />
          <QuickLink to="/payroll" title="٣. أدخل مرتبات الشهر" desc="يدوياً أو برفع ملف Excel" />
          <QuickLink to="/compare" title="٤. قارن بين شهرين" desc="اطلع على الفروقات والتنبيهات" />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickLink({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="block p-4 rounded-lg border hover:border-primary hover:bg-secondary/50 transition">
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{desc}</div>
    </Link>
  );
}
