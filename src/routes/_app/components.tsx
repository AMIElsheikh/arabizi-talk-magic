import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/components")({
  component: ComponentsPage,
});

const DEFAULTS = [
  { name: "المرتب الأساسي", type: "earning" as const, display_order: 1 },
  { name: "الحافز الوظيفي", type: "earning" as const, display_order: 2 },
  { name: "بدل انتقال", type: "earning" as const, display_order: 3 },
  { name: "بدل طبيعة عمل", type: "earning" as const, display_order: 4 },
  { name: "بدل وجبة", type: "earning" as const, display_order: 5 },
  { name: "مكافأة", type: "earning" as const, display_order: 6 },
  { name: "ساعات إضافية", type: "earning" as const, display_order: 7 },
  { name: "تأمينات اجتماعية", type: "deduction" as const, display_order: 10 },
  { name: "ضريبة كسب العمل", type: "deduction" as const, display_order: 11 },
  { name: "سلفة", type: "deduction" as const, display_order: 12 },
  { name: "غياب", type: "deduction" as const, display_order: 13 },
  { name: "جزاءات", type: "deduction" as const, display_order: 14 },
];

function ComponentsPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["components"],
    queryFn: async () => {
      const { data, error } = await supabase.from("salary_components").select("*").order("type").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "earning" as "earning" | "deduction", display_order: 0 });

  const save = async () => {
    if (!form.name) return toast.error("اكتب اسم البند");
    const user = (await supabase.auth.getUser()).data.user!;
    const { error } = await supabase.from("salary_components").insert({ ...form, user_id: user.id });
    if (error) return toast.error(error.message);
    toast.success("تم الإضافة");
    setForm({ name: "", type: "earning", display_order: 0 });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["components"] });
  };

  const remove = async (id: string) => {
    if (!confirm("حذف البند؟ لن يتأثر إذا كان مستخدم في سجلات سابقة")) return;
    const { error } = await supabase.from("salary_components").delete().eq("id", id);
    if (error) return toast.error("لا يمكن الحذف، البند مستخدم بالفعل");
    else toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["components"] });
  };

  const seedDefaults = async () => {
    const user = (await supabase.auth.getUser()).data.user!;
    const existing = new Set(data.map((d: any) => d.name));
    const toInsert = DEFAULTS.filter((d) => !existing.has(d.name)).map((d) => ({ ...d, user_id: user.id }));
    if (toInsert.length === 0) return toast.info("كل البنود الافتراضية موجودة");
    const { error } = await supabase.from("salary_components").insert(toInsert);
    if (error) return toast.error(error.message);
    toast.success(`تم إضافة ${toInsert.length} بند`);
    qc.invalidateQueries({ queryKey: ["components"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">بنود المرتب</h1>
          <p className="text-muted-foreground mt-1">الاستحقاقات والخصومات</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={seedDefaults}><Sparkles className="w-4 h-4 ml-1" /> إضافة بنود افتراضية</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 ml-1" /> بند جديد</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>بند جديد</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>اسم البند</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div>
                  <Label>النوع</Label>
                  <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="earning">استحقاق</SelectItem>
                      <SelectItem value="deduction">خصم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>ترتيب العرض</Label><Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: +e.target.value })} /></div>
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
                <TableHead className="text-right">اسم البند</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">الترتيب</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا يوجد بنود — اضغط "إضافة بنود افتراضية" للبدء بسرعة</TableCell></TableRow>}
              {data.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    {c.type === "earning"
                      ? <Badge className="bg-success text-success-foreground">استحقاق</Badge>
                      : <Badge variant="destructive">خصم</Badge>}
                  </TableCell>
                  <TableCell>{c.display_order}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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
