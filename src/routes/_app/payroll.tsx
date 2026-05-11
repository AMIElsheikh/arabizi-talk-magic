import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save, Upload, Download, Copy } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_app/payroll")({
  component: PayrollPage,
});

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function PayrollPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => (await supabase.from("employees").select("*").eq("is_active", true).order("employee_code")).data || [],
  });

  const { data: components = [] } = useQuery({
    queryKey: ["components"],
    queryFn: async () => (await supabase.from("salary_components").select("*").order("type").order("display_order")).data || [],
  });

  const { data: existing = [] } = useQuery({
    queryKey: ["records", year, month],
    queryFn: async () => {
      const { data: recs } = await supabase.from("salary_records").select("*, salary_record_items(*)").eq("year", year).eq("month", month);
      return recs || [];
    },
  });

  // grid[empId][compId] = amount
  const [grid, setGrid] = useState<Record<string, Record<string, number>>>({});
  const [loaded, setLoaded] = useState<string>("");

  // Initialize grid from existing
  useMemo(() => {
    const key = `${year}-${month}-${existing.length}-${employees.length}`;
    if (key === loaded) return;
    const g: Record<string, Record<string, number>> = {};
    employees.forEach((e: any) => { g[e.id] = {}; });
    existing.forEach((r: any) => {
      if (!g[r.employee_id]) g[r.employee_id] = {};
      r.salary_record_items.forEach((it: any) => { g[r.employee_id][it.component_id] = Number(it.amount); });
    });
    setGrid(g);
    setLoaded(key);
  }, [year, month, existing, employees, loaded]);

  const setCell = (empId: string, compId: string, value: number) => {
    setGrid((g) => ({ ...g, [empId]: { ...g[empId], [compId]: value } }));
  };

  const computeTotals = (empId: string) => {
    let earn = 0, ded = 0;
    components.forEach((c: any) => {
      const v = grid[empId]?.[c.id] || 0;
      if (c.type === "earning") earn += v; else ded += v;
    });
    return { earn, ded, net: earn - ded };
  };

  const copyFromPrevMonth = async () => {
    const prevDate = new Date(year, month - 2);
    const py = prevDate.getFullYear(), pm = prevDate.getMonth() + 1;
    const { data: prev } = await supabase.from("salary_records").select("*, salary_record_items(*)").eq("year", py).eq("month", pm);
    if (!prev || prev.length === 0) return toast.error(`لا توجد بيانات لـ ${MONTHS[pm - 1]} ${py}`);
    const g: Record<string, Record<string, number>> = { ...grid };
    prev.forEach((r: any) => {
      g[r.employee_id] = g[r.employee_id] || {};
      r.salary_record_items.forEach((it: any) => { g[r.employee_id][it.component_id] = Number(it.amount); });
    });
    setGrid(g);
    toast.success(`تم نسخ بيانات ${MONTHS[pm - 1]} ${py}`);
  };

  const saveAll = async () => {
    const user = (await supabase.auth.getUser()).data.user!;
    let saved = 0;
    for (const emp of employees) {
      const cells = grid[emp.id] || {};
      const items = components.filter((c: any) => cells[c.id] && cells[c.id] !== 0);
      if (items.length === 0) continue;
      const { earn, ded, net } = computeTotals(emp.id);
      const { data: rec, error } = await supabase.from("salary_records").upsert(
        { user_id: user.id, employee_id: emp.id, year, month, total_earnings: earn, total_deductions: ded, net_salary: net },
        { onConflict: "employee_id,year,month" }
      ).select().single();
      if (error) { toast.error(`خطأ في ${emp.full_name}`); continue; }
      await supabase.from("salary_record_items").delete().eq("record_id", rec.id);
      const itemsPayload = items.map((c: any) => ({ record_id: rec.id, component_id: c.id, amount: cells[c.id] }));
      await supabase.from("salary_record_items").insert(itemsPayload);
      saved++;
    }
    toast.success(`تم حفظ ${saved} سجل`);
    qc.invalidateQueries({ queryKey: ["records"] });
  };

  const downloadTemplate = () => {
    const headers = ["employee_code", "full_name", ...components.map((c: any) => c.name)];
    const rows = employees.map((e: any) => [e.employee_code, e.full_name, ...components.map(() => 0)]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, `template-${year}-${month}.xlsx`);
  };

  const handleImport = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    const empByCode = new Map(employees.map((e: any) => [String(e.employee_code), e]));
    const compByName = new Map(components.map((c: any) => [c.name, c]));
    const g: Record<string, Record<string, number>> = { ...grid };
    let matched = 0;
    rows.forEach((row) => {
      const code = String(row.employee_code || "").trim();
      const emp = empByCode.get(code);
      if (!emp) return;
      g[emp.id] = g[emp.id] || {};
      Object.entries(row).forEach(([k, v]) => {
        const comp = compByName.get(k);
        if (comp && typeof v === "number") g[emp.id][comp.id] = v;
      });
      matched++;
    });
    setGrid(g);
    toast.success(`تم استيراد ${matched} موظف`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">إدخال المرتبات</h1>
        <p className="text-muted-foreground mt-1">أدخل أو راجع بنود مرتبات الشهر</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
          <div>
            <Label>السنة</Label>
            <Input type="number" className="w-28" value={year} onChange={(e) => setYear(+e.target.value)} />
          </div>
          <div>
            <Label>الشهر</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(+v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 mr-auto">
            <Button variant="outline" onClick={copyFromPrevMonth}><Copy className="w-4 h-4 ml-1" /> نسخ من الشهر السابق</Button>
            <Button variant="outline" onClick={downloadTemplate}><Download className="w-4 h-4 ml-1" /> قالب Excel</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 ml-1" /> رفع Excel</Button>
            <Button onClick={saveAll}><Save className="w-4 h-4 ml-1" /> حفظ الكل</Button>
          </div>
        </CardContent>
      </Card>

      {employees.length === 0 || components.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {employees.length === 0 ? "أضف موظفين أولاً" : "أضف بنود مرتب أولاً"}
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>{MONTHS[month - 1]} {year}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right sticky right-0 bg-card">الموظف</TableHead>
                  {components.map((c: any) => (
                    <TableHead key={c.id} className={`text-right whitespace-nowrap ${c.type === "deduction" ? "text-destructive" : ""}`}>{c.name}</TableHead>
                  ))}
                  <TableHead className="text-right font-bold">الصافي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e: any) => {
                  const t = computeTotals(e.id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium sticky right-0 bg-card">
                        <div>{e.full_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{e.employee_code}</div>
                      </TableCell>
                      {components.map((c: any) => (
                        <TableCell key={c.id}>
                          <Input
                            type="number"
                            className="w-24 h-8"
                            value={grid[e.id]?.[c.id] || ""}
                            onChange={(ev) => setCell(e.id, c.id, +ev.target.value || 0)}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="font-bold whitespace-nowrap">{t.net.toLocaleString("ar-EG")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
