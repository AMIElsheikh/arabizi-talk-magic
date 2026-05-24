import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Building2, Users, X, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useRef } from "react";

export const Route = createFileRoute("/_app/departments")({
  component: DepartmentsPage,
});

type Dept = { id?: string; name: string; description: string; display_order: number };
type Emp = { id?: string; employee_code: string; full_name: string; position: string; department_id: string | null };

function DepartmentsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: depts = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: empCounts = {} } = useQuery({
    queryKey: ["employees-by-dept"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("department_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        if (e.department_id) counts[e.department_id] = (counts[e.department_id] || 0) + 1;
      });
      return counts;
    },
  });

  const empty: Dept = { name: "", description: "", display_order: 0 };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [form, setForm] = useState<Dept>(empty);

  // Employees modal per department
  const [activeDept, setActiveDept] = useState<Dept | null>(null);
  const [empOpen, setEmpOpen] = useState(false);
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [empForm, setEmpForm] = useState<Emp>({ employee_code: "", full_name: "", position: "", department_id: null });

  const { data: deptEmployees = [] } = useQuery({
    queryKey: ["dept-employees", activeDept?.id],
    enabled: !!activeDept?.id,
    queryFn: async () => {
      if (!activeDept?.id) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("department_id", activeDept.id)
        .order("employee_code");
      if (error) throw error;
      return data || [];
    },
  });

  const openNew = () => { setEditing(null); setForm({ ...empty, display_order: depts.length + 1 }); setOpen(true); };
  const openEdit = (d: any) => { setEditing(d); setForm(d); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error("اسم القسم مطلوب");
    const user = (await supabase.auth.getUser()).data.user!;
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      description: form.description?.trim() || null,
      display_order: Number(form.display_order) || 0,
    };
    const { error } = editing
      ? await supabase.from("departments").update(payload).eq("id", editing.id!)
      : await supabase.from("departments").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["departments"] });
  };

  const remove = async (id: string) => {
    if (!confirm("تأكيد حذف القسم؟ سيتم فك ربطه عن الموظفين.")) return;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["departments"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["employees-by-dept"] });
  };

  const seedDefaults = async () => {
    const user = (await supabase.auth.getUser()).data.user!;
    const defaults = [
      { name: "مطار الإسكندرية الدولي", display_order: 1 },
      { name: "مطار سفنكس الدولي", display_order: 2 },
      { name: "مطار العلمين", display_order: 3 },
    ].map((d) => ({ ...d, user_id: user.id }));
    const { error } = await supabase.from("departments").insert(defaults);
    if (error) return toast.error(error.message);
    toast.success("تم إضافة الأقسام الافتراضية");
    qc.invalidateQueries({ queryKey: ["departments"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">الأقسام</h1>
          <p className="text-muted-foreground mt-1">إدارة الأقسام / الفروع / المطارات وتوزيع الموظفين</p>
        </div>
        <div className="flex gap-2">
          {depts.length === 0 && (
            <Button variant="outline" onClick={seedDefaults}>
              <Building2 className="w-4 h-4 ml-1" /> إضافة الأقسام الافتراضية
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="w-4 h-4 ml-1" /> إضافة قسم</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "تعديل قسم" : "قسم جديد"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>اسم القسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: مطار الإسكندرية الدولي" /></div>
                <div><Label>الوصف (اختياري)</Label><Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>ترتيب العرض</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} /></div>
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
                <TableHead className="text-right">#</TableHead>
                <TableHead className="text-right">اسم القسم</TableHead>
                <TableHead className="text-right">الوصف</TableHead>
                <TableHead className="text-right">عدد الموظفين</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {depts.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا يوجد أقسام بعد</TableCell></TableRow>
              )}
              {depts.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono">{d.display_order}</TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.description || "-"}</TableCell>
                  <TableCell><Badge variant="secondary">{empCounts[d.id] || 0}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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
