import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Settings as SettingsIcon, Save, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

type Settings = {
  company_name: string;
  commercial_register: string;
  tax_number: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  currency: string;
  large_diff_threshold: number;
  notes: string;
};

const empty: Settings = {
  company_name: "",
  commercial_register: "",
  tax_number: "",
  address: "",
  phone: "",
  email: "",
  logo_url: "",
  currency: "EGP",
  large_diff_threshold: 10,
  notes: "",
};

function SettingsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Settings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: row, error } = await supabase
        .from("company_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) toast.error("تعذر تحميل الإعدادات");
      if (row) {
        setData({
          company_name: row.company_name ?? "",
          commercial_register: row.commercial_register ?? "",
          tax_number: row.tax_number ?? "",
          address: row.address ?? "",
          phone: row.phone ?? "",
          email: row.email ?? "",
          logo_url: row.logo_url ?? "",
          currency: row.currency ?? "EGP",
          large_diff_threshold: Number(row.large_diff_threshold ?? 10),
          notes: row.notes ?? "",
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("company_settings")
      .upsert({ user_id: user.id, ...data }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error("فشل حفظ الإعدادات");
    } else {
      toast.success("تم حفظ الإعدادات بنجاح");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin ml-2" />
        جاري التحميل...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">الإعدادات</h1>
          <p className="text-sm text-muted-foreground">إدارة بيانات الشركة وإعدادات البرنامج</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
          حفظ التغييرات
        </Button>
      </div>

      <Tabs defaultValue="company" dir="rtl">
        <TabsList>
          <TabsTrigger value="company">
            <Building2 className="w-4 h-4 ml-2" />
            بيانات الشركة
          </TabsTrigger>
          <TabsTrigger value="program">
            <SettingsIcon className="w-4 h-4 ml-2" />
            إعدادات البرنامج
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>بيانات الشركة والسجلات</CardTitle>
              <CardDescription>تستخدم هذه البيانات في رأس التقارير المصدّرة</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>اسم الشركة</Label>
                <Input value={data.company_name} onChange={(e) => update("company_name", e.target.value)} placeholder="شركة ..." />
              </div>
              <div className="space-y-2">
                <Label>السجل التجاري</Label>
                <Input value={data.commercial_register} onChange={(e) => update("commercial_register", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الرقم الضريبي</Label>
                <Input value={data.tax_number} onChange={(e) => update("tax_number", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الهاتف</Label>
                <Input value={data.phone} onChange={(e) => update("phone", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input type="email" value={data.email} onChange={(e) => update("email", e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>العنوان</Label>
                <Textarea value={data.address} onChange={(e) => update("address", e.target.value)} rows={2} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>رابط شعار الشركة (اختياري)</Label>
                <Input value={data.logo_url} onChange={(e) => update("logo_url", e.target.value)} placeholder="https://..." dir="ltr" />
                {data.logo_url && (
                  <img src={data.logo_url} alt="شعار" className="h-16 mt-2 rounded border object-contain" />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="program">
          <Card>
            <CardHeader>
              <CardTitle>إعدادات البرنامج</CardTitle>
              <CardDescription>اضبط العملة وحدود التنبيهات</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>العملة</Label>
                <Select value={data.currency} onValueChange={(v) => update("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">جنيه مصري (EGP)</SelectItem>
                    <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                    <SelectItem value="AED">درهم إماراتي (AED)</SelectItem>
                    <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
                    <SelectItem value="EUR">يورو (EUR)</SelectItem>
                    <SelectItem value="KWD">دينار كويتي (KWD)</SelectItem>
                    <SelectItem value="QAR">ريال قطري (QAR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نسبة تنبيه الفروقات الكبيرة (%)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={data.large_diff_threshold}
                  onChange={(e) => update("large_diff_threshold", Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">أي فرق بين الشهرين يتجاوز هذه النسبة سيظهر كتنبيه</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>ملاحظات عامة</Label>
                <Textarea value={data.notes} onChange={(e) => update("notes", e.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
