import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRole } from "@/hooks/use-role";
import { useAuth } from "@/hooks/use-auth";
import { Trash2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "مدير (تحكم كامل)",
  editor: "محرر (إضافة وتعديل)",
  viewer: "مشاهد (اطلاع فقط)",
};

function UsersPage() {
  const { isAdmin, isLoading: roleLoading } = useRole();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: roles = [] } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const profileMap: Record<string, any> = {};
  profiles.forEach((p: any) => { profileMap[p.id] = p; });

  const changeRole = async (userId: string, role: string) => {
    const { error } = await supabase.from("user_roles").update({ role, granted_by: user?.id }).eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("تم تحديث الصلاحية");
    qc.invalidateQueries({ queryKey: ["all-user-roles"] });
  };

  const removeUser = async (userId: string) => {
    if (!confirm("إزالة صلاحيات هذا المستخدم؟ لن يستطيع الدخول للنظام")) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("تم الإزالة");
    qc.invalidateQueries({ queryKey: ["all-user-roles"] });
  };

  if (roleLoading) return <div className="text-muted-foreground">جاري التحميل...</div>;

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-2">
          <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-bold">غير مصرح لك</h2>
          <p className="text-muted-foreground">هذه الصفحة متاحة للمدير فقط</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">المستخدمين والصلاحيات</h1>
        <p className="text-muted-foreground mt-1">إدارة من يستطيع الدخول للنظام ومستوى صلاحياته</p>
      </div>

      <Card className="bg-muted/40">
        <CardContent className="p-4 text-sm space-y-2">
          <p className="font-medium">كيف تضيف مستخدم جديد؟</p>
          <ol className="list-decimal pr-5 space-y-1 text-muted-foreground">
            <li>اطلب من الشخص الجديد إنشاء حساب من صفحة تسجيل الدخول بنفسه</li>
            <li>سيظهر هنا تلقائيًا بصلاحية "مشاهد" (اطلاع فقط)</li>
            <li>من القائمة أدناه يمكنك تغيير صلاحيته إلى "محرر" أو "مدير"</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">الصلاحية</TableHead>
                <TableHead className="text-right">تاريخ الإضافة</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا يوجد مستخدمين</TableCell></TableRow>}
              {roles.map((r: any) => {
                const p = profileMap[r.user_id];
                const isSelf = r.user_id === user?.id;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{p?.full_name || "—"}</div>
                      {isSelf && <Badge variant="secondary" className="mt-1">أنت</Badge>}
                    </TableCell>
                    <TableCell>
                      {isSelf ? (
                        <Badge>{ROLE_LABEL[r.role]}</Badge>
                      ) : (
                        <Select value={r.role} onValueChange={(v) => changeRole(r.user_id, v)}>
                          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                            <SelectItem value="editor">{ROLE_LABEL.editor}</SelectItem>
                            <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell>
                      {!isSelf && (
                        <Button size="icon" variant="ghost" onClick={() => removeUser(r.user_id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
