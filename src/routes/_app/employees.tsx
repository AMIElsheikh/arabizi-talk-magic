import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useRef } from "react";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

type Emp = {
  id?: string;
  employee_code: string;
  full_name: string;
  position: string;
  department: string;
  department_id: string | null;
  is_active: boolean;
};

const NONE = "__none__";

function EmployeesPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("employee_code");
      if (error) throw error;
      return data;
    },
  });

  const { data: depts = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("display_order").order("name");
      if (error) throw error;
      return data;
    },
  });

  const deptMap = useMemo(() => {
    const m: Record<string, string> = {};
    depts.forEach((d: any) => { m[d.id] = d.name; });
    return m;
  }, [depts]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Emp | null>(null);
  const [filterDept, setFilterDept] = useState<string>("all");

  const empty: Emp = { employee_code: "", full_name: "", position: "", department: "", department_id: null, is_active: true };
  const [form, setForm] = useState<Emp>(empty);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setForm({ ...empty, ...e }); setOpen(true); };

  const save = async () => {
    if (!form.employee_code || !form.full_name) return toast.error("الكود والاسم مطلوبين");
    const user = (await supabase.auth.getUser()).data.user!;
    const payload: any = {
      user_id: user.id,
      employee_code: form.employee_code,
      full_name: form.full_name,
      position: form.position || null,
      department_id: form.department_id || null,
      department: form.department_id ? (deptMap[form.department_id] || null) : (form.department || null),
      is_active: form.is_active,
    };
    const { error } = editing
      ? await supabase.from("employees").update(payload).eq("id", editing.id!)
      : await supabase.from("employees").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["employees-by-dept"] });
  };

  const remove = async (id: string) => {
    if (!confirm("تأكيد حذف الموظف؟ سيتم حذف كل سجلاته")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["employees"] });
  };

  const filtered = data.filter((e: any) => filterDept === "all" ? true : (filterDept === NONE ? !e.department_id : e.department_id === filterDept));

  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["employee_code", "full_name", "position", "department"],
      ["E001", "محمد أحمد", "موظف", depts[0]?.name || "مطار الإسكندرية الدولي"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "employees");
    XLSX.writeFile(wb, "employees_template.xlsx");
  };

  const importExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
      if (!aoa.length) return toast.error("الملف فارغ");

      const codeKeys = ["employee_code", "code", "كود", "الكود", "الكود الوظيفي", "رقم", "الرقم", "رقم الموظف", "id"];
      const nameKeys = ["full_name", "name", "اسم", "الاسم", "اسم الموظف", "الاسم الكامل"];
      const posKeys = ["position", "المسمى", "الوظيفة", "المسمى الوظيفي", "الوظيفه"];
      const deptKeys = ["department", "قسم", "القسم", "الإدارة", "الاداره"];

      const norm = (s: any) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const matchIdx = (headers: string[], keys: string[]) => {
        const ks = keys.map(norm);
        return headers.findIndex((h) => ks.includes(norm(h)));
      };

      let headerRow = -1, cCode = -1, cName = -1, cPos = -1, cDept = -1;
      for (let i = 0; i < Math.min(aoa.length, 10); i++) {
        const row = aoa[i].map((x) => String(x ?? ""));
        const ic = matchIdx(row, codeKeys);
        const ina = matchIdx(row, nameKeys);
        if (ic >= 0 && ina >= 0) {
          headerRow = i; cCode = ic; cName = ina;
          cPos = matchIdx(row, posKeys);
          cDept = matchIdx(row, deptKeys);
          break;
        }
      }

      let dataRows: any[][];
      if (headerRow === -1) {
        // Fallback: assume positional [code, name, position, department] starting from first non-empty row
        dataRows = aoa;
        cCode = 0; cName = 1; cPos = 2; cDept = 3;
      } else {
        dataRows = aoa.slice(headerRow + 1);
      }

      const fileDept = file.name.replace(/\.(xlsx|xls|csv)$/i, "").trim();
      const user = (await supabase.auth.getUser()).data.user!;
      const deptByName: Record<string, string> = {};
      depts.forEach((d: any) => { deptByName[String(d.name).trim()] = d.id; });

      const payload = dataRows.map((r) => {
        const code = String(r[cCode] ?? "").trim();
        const name = String(r[cName] ?? "").trim();
        const position = cPos >= 0 ? String(r[cPos] ?? "").trim() : "";
        const deptName = (cDept >= 0 ? String(r[cDept] ?? "").trim() : "") || fileDept;
        return {
          user_id: user.id,
          employee_code: code,
          full_name: name,
          position: position || null,
          department: deptName || null,
          department_id: deptByName[deptName] || null,
          is_active: true,
        };
      }).filter((r) => r.employee_code && r.full_name);

      if (!payload.length) {
        const sample = (aoa[0] || []).slice(0, 6).join(" | ");
        return toast.error(`لا توجد بيانات صالحة. تأكد من وجود عمود للكود وعمود للاسم. أول صف: ${sample}`);
      }

      const BATCH = 500;
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < payload.length; i += BATCH) {
        const chunk = payload.slice(i, i + BATCH);
        const { error } = await supabase.from("employees").insert(chunk);
        if (error) { errors.push(error.message); continue; }
        inserted += chunk.length;
      }
      if (inserted === 0) return toast.error("فشل الاستيراد: " + (errors[0] || "خطأ غير معروف"));
      toast.success(`تم استيراد ${inserted} موظف${errors.length ? ` (${errors.length} دفعة فشلت)` : ""}`);
      qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error("فشل قراءة الملف: " + (err.message || err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">الموظفين</h1>
          <p className="text-muted-foreground mt-1">إدارة بيانات الموظفين وتوزيعهم على الأقسام</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="فلترة بالقسم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              <SelectItem value={NONE}>بدون قسم</SelectItem>
              {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={downloadTemplate}><Download className="w-4 h-4 ml-1" /> قالب Excel</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 ml-1" /> رفع من Excel</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="w-4 h-4 ml-1" /> إضافة موظف</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "تعديل موظف" : "موظف جديد"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>الكود الوظيفي</Label><Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} /></div>
                <div><Label>الاسم الكامل</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div><Label>المسمى الوظيفي</Label><Input value={form.position || ""} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
                <div>
                  <Label>القسم</Label>
                  <Select value={form.department_id || NONE} onValueChange={(v) => setForm({ ...form, department_id: v === NONE ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>بدون قسم</SelectItem>
                      {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {depts.length === 0 && <p className="text-xs text-muted-foreground mt-1">لا توجد أقسام بعد. أضف الأقسام من صفحة "الأقسام".</p>}
                </div>
              </div>
              <DialogFooter><Button onClick={save}>حفظ</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">المسمى</TableHead>
                <TableHead className="text-right">القسم</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا يوجد موظفين</TableCell></TableRow>}
              {filtered.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono">{e.employee_code}</TableCell>
                  <TableCell className="font-medium">{e.full_name}</TableCell>
                  <TableCell>{e.position || "-"}</TableCell>
                  <TableCell>{e.department_id ? (deptMap[e.department_id] || "-") : (e.department || "-")}</TableCell>
                  <TableCell>{e.is_active ? <Badge>نشط</Badge> : <Badge variant="secondary">غير نشط</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
