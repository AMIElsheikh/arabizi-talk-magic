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
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) return toast.error("الملف فارغ");
      const user = (await supabase.auth.getUser()).data.user!;
      const deptByName: Record<string, string> = {};
      depts.forEach((d: any) => { deptByName[String(d.name).trim()] = d.id; });
      const payload = rows.map((r) => {
        const code = String(r.employee_code ?? r.code ?? r["الكود"] ?? "").trim();
        const name = String(r.full_name ?? r.name ?? r["الاسم"] ?? "").trim();
        const position = String(r.position ?? r["المسمى"] ?? "").trim();
        const deptName = String(r.department ?? r["القسم"] ?? "").trim();
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
      if (!payload.length) return toast.error("لا توجد بيانات صالحة (الكود والاسم مطلوبين)");
      const { error } = await supabase.from("employees").insert(payload);
      if (error) return toast.error(error.message);
      toast.success(`تم استيراد ${payload.length} موظف`);
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
