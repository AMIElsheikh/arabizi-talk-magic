import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesPage,
});

type Emp = { id?: string; employee_code: string; full_name: string; position: string; department: string; is_active: boolean };

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

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Emp | null>(null);

  const empty: Emp = { employee_code: "", full_name: "", position: "", department: "", is_active: true };
  const [form, setForm] = useState<Emp>(empty);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setForm(e); setOpen(true); };

  const save = async () => {
    if (!form.employee_code || !form.full_name) return toast.error("الكود والاسم مطلوبين");
    const user = (await supabase.auth.getUser()).data.user!;
    const payload = { ...form, user_id: user.id };
    const { error } = editing
      ? await supabase.from("employees").update(payload).eq("id", editing.id!)
      : await supabase.from("employees").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["employees"] });
  };

  const remove = async (id: string) => {
    if (!confirm("تأكيد حذف الموظف؟ سيتم حذف كل سجلاته")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["employees"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الموظفين</h1>
          <p className="text-muted-foreground mt-1">إدارة بيانات الموظفين</p>
        </div>
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
              <div><Label>الإدارة</Label><Input value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>حفظ</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">المسمى</TableHead>
                <TableHead className="text-right">الإدارة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا يوجد موظفين بعد</TableCell></TableRow>}
              {data.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono">{e.employee_code}</TableCell>
                  <TableCell className="font-medium">{e.full_name}</TableCell>
                  <TableCell>{e.position || "-"}</TableCell>
                  <TableCell>{e.department || "-"}</TableCell>
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
