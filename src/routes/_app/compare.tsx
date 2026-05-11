import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Download, FileText, TrendingUp, TrendingDown, Minus } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_app/compare")({
  component: ComparePage,
});

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function ComparePage() {
  const now = new Date();
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1);
  const [curY, setCurY] = useState(now.getFullYear());
  const [curM, setCurM] = useState(now.getMonth() + 1);
  const [prevY, setPrevY] = useState(prevDate.getFullYear());
  const [prevM, setPrevM] = useState(prevDate.getMonth() + 1);
  const [threshold, setThreshold] = useState(10);

  const fetchPeriod = async (y: number, m: number) => {
    const { data } = await supabase
      .from("salary_records")
      .select("*, employees(employee_code, full_name), salary_record_items(amount, component_id, salary_components(name, type))")
      .eq("year", y).eq("month", m);
    return data || [];
  };

  const { data: cur = [] } = useQuery({ queryKey: ["cmp", curY, curM], queryFn: () => fetchPeriod(curY, curM) });
  const { data: prev = [] } = useQuery({ queryKey: ["cmp", prevY, prevM], queryFn: () => fetchPeriod(prevY, prevM) });

  const diff = useMemo(() => {
    // Build per-employee per-component map
    const build = (recs: any[]) => {
      const m = new Map<string, { emp: any; rec: any; items: Map<string, { amount: number; comp: any }> }>();
      recs.forEach((r) => {
        const items = new Map();
        r.salary_record_items.forEach((it: any) => items.set(it.component_id, { amount: Number(it.amount), comp: it.salary_components }));
        m.set(r.employee_id, { emp: r.employees, rec: r, items });
      });
      return m;
    };
    const C = build(cur);
    const P = build(prev);

    const empIds = new Set([...C.keys(), ...P.keys()]);
    const rows: any[] = [];
    let totalCurNet = 0, totalPrevNet = 0;
    const componentTotals = new Map<string, { name: string; type: string; cur: number; prev: number }>();

    empIds.forEach((eid) => {
      const c = C.get(eid), p = P.get(eid);
      const emp = c?.emp || p?.emp;
      const compIds = new Set([...(c?.items.keys() || []), ...(p?.items.keys() || [])]);
      const empRows: any[] = [];
      compIds.forEach((cid) => {
        const ci = c?.items.get(cid), pi = p?.items.get(cid);
        const comp = ci?.comp || pi?.comp;
        const cv = ci?.amount || 0, pv = pi?.amount || 0;
        const d = cv - pv;
        const pct = pv === 0 ? (cv === 0 ? 0 : 100) : (d / pv) * 100;
        const t = componentTotals.get(comp.name) || { name: comp.name, type: comp.type, cur: 0, prev: 0 };
        t.cur += cv; t.prev += pv;
        componentTotals.set(comp.name, t);
        if (d !== 0) empRows.push({ emp, comp, cv, pv, d, pct });
      });
      const cNet = Number(c?.rec.net_salary || 0), pNet = Number(p?.rec.net_salary || 0);
      totalCurNet += cNet; totalPrevNet += pNet;
      if (empRows.length > 0) rows.push({ emp, items: empRows, cNet, pNet, dNet: cNet - pNet });
    });

    return { rows, totalCurNet, totalPrevNet, componentTotals: Array.from(componentTotals.values()) };
  }, [cur, prev]);

  const fmt = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const periodLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;

  const exportExcel = () => {
    const rows = [["الكود", "الموظف", "البند", "النوع", periodLabel(prevY, prevM), periodLabel(curY, curM), "الفرق", "النسبة %"]];
    diff.rows.forEach((r) => {
      r.items.forEach((it: any) => {
        rows.push([r.emp.employee_code, r.emp.full_name, it.comp.name, it.comp.type === "earning" ? "استحقاق" : "خصم", String(it.pv), String(it.cv), String(it.d), it.pct.toFixed(1)]);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compare");
    XLSX.writeFile(wb, `comparison-${prevY}-${prevM}-vs-${curY}-${curM}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica");
    doc.text(`Salary Comparison: ${prevY}-${prevM} vs ${curY}-${curM}`, 14, 15);
    autoTable(doc, {
      startY: 22,
      head: [["Code", "Employee", "Component", "Prev", "Current", "Diff", "%"]],
      body: diff.rows.flatMap((r) => r.items.map((it: any) => [r.emp.employee_code, r.emp.full_name, it.comp.name, fmt(it.pv), fmt(it.cv), fmt(it.d), it.pct.toFixed(1) + "%"])),
      styles: { fontSize: 8 },
    });
    doc.save(`comparison-${prevY}-${prevM}-vs-${curY}-${curM}.pdf`);
  };

  const DiffCell = ({ d, pct }: { d: number; pct: number }) => {
    const isLarge = Math.abs(pct) >= threshold;
    if (d === 0) return <span className="text-muted-foreground"><Minus className="w-4 h-4 inline" /></span>;
    const Icon = d > 0 ? TrendingUp : TrendingDown;
    const color = d > 0 ? "text-success" : "text-destructive";
    return (
      <span className={`inline-flex items-center gap-1 ${color} ${isLarge ? "font-bold" : ""}`}>
        {isLarge && <AlertTriangle className="w-3 h-3 text-warning" />}
        <Icon className="w-3 h-3" />
        {fmt(Math.abs(d))} ({pct.toFixed(1)}%)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">المقارنة الشهرية</h1>
        <p className="text-muted-foreground mt-1">قارن بين شهرين واطلع على الفروقات</p>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-4 md:grid-cols-5 items-end">
          <div>
            <Label>الشهر السابق</Label>
            <div className="flex gap-2">
              <Input type="number" className="w-20" value={prevY} onChange={(e) => setPrevY(+e.target.value)} />
              <Select value={String(prevM)} onValueChange={(v) => setPrevM(+v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>الشهر الحالي</Label>
            <div className="flex gap-2">
              <Input type="number" className="w-20" value={curY} onChange={(e) => setCurY(+e.target.value)} />
              <Select value={String(curM)} onValueChange={(v) => setCurM(+v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>عتبة التنبيه (%)</Label>
            <Input type="number" value={threshold} onChange={(e) => setThreshold(+e.target.value)} />
          </div>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <Button variant="outline" onClick={exportExcel}><Download className="w-4 h-4 ml-1" /> Excel</Button>
            <Button variant="outline" onClick={exportPDF}><FileText className="w-4 h-4 ml-1" /> PDF</Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">إجمالي الصافي - {periodLabel(prevY, prevM)}</div>
          <div className="text-2xl font-bold mt-1">{fmt(diff.totalPrevNet)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">إجمالي الصافي - {periodLabel(curY, curM)}</div>
          <div className="text-2xl font-bold mt-1">{fmt(diff.totalCurNet)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">الفرق الإجمالي</div>
          <div className={`text-2xl font-bold mt-1 ${diff.totalCurNet - diff.totalPrevNet >= 0 ? "text-success" : "text-destructive"}`}>
            {fmt(diff.totalCurNet - diff.totalPrevNet)}
          </div>
        </CardContent></Card>
      </div>

      {/* Component totals */}
      <Card>
        <CardHeader><CardTitle>الفروقات الإجمالية حسب البند</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">البند</TableHead>
                <TableHead className="text-right">{periodLabel(prevY, prevM)}</TableHead>
                <TableHead className="text-right">{periodLabel(curY, curM)}</TableHead>
                <TableHead className="text-right">الفرق</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diff.componentTotals.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">لا توجد بيانات للمقارنة</TableCell></TableRow>}
              {diff.componentTotals.map((c) => {
                const d = c.cur - c.prev;
                const pct = c.prev === 0 ? 0 : (d / c.prev) * 100;
                return (
                  <TableRow key={c.name}>
                    <TableCell>
                      {c.name}{" "}
                      {c.type === "earning"
                        ? <Badge className="bg-success text-success-foreground mr-1">استحقاق</Badge>
                        : <Badge variant="destructive" className="mr-1">خصم</Badge>}
                    </TableCell>
                    <TableCell>{fmt(c.prev)}</TableCell>
                    <TableCell>{fmt(c.cur)}</TableCell>
                    <TableCell><DiffCell d={d} pct={pct} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-employee detail */}
      <Card>
        <CardHeader><CardTitle>تفاصيل الفروقات لكل موظف</CardTitle></CardHeader>
        <CardContent className="p-0">
          {diff.rows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">لا توجد فروقات بين الشهرين</div>
          ) : (
            <div className="divide-y">
              {diff.rows.map((r) => (
                <div key={r.emp.employee_code} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-bold">{r.emp.full_name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{r.emp.employee_code}</div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">فرق الصافي: </span>
                      <span className={`font-bold ${r.dNet >= 0 ? "text-success" : "text-destructive"}`}>{fmt(r.dNet)}</span>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">البند</TableHead>
                        <TableHead className="text-right">{periodLabel(prevY, prevM)}</TableHead>
                        <TableHead className="text-right">{periodLabel(curY, curM)}</TableHead>
                        <TableHead className="text-right">الفرق</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.items.map((it: any) => (
                        <TableRow key={it.comp.name}>
                          <TableCell>{it.comp.name}</TableCell>
                          <TableCell>{fmt(it.pv)}</TableCell>
                          <TableCell>{fmt(it.cv)}</TableCell>
                          <TableCell><DiffCell d={it.d} pct={it.pct} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
