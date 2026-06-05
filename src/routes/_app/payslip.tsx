import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Printer, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/payslip")({
  component: PayslipPage,
});

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function PayslipPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employeeId, setEmployeeId] = useState<string>("");

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => (await supabase.from("employees").select("*").eq("is_active", true).order("full_name")).data || [],
  });

  const { data: company } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => (await supabase.from("company_settings").select("*").maybeSingle()).data,
  });

  const { data: components = [] } = useQuery({
    queryKey: ["components"],
    queryFn: async () => (await supabase.from("salary_components").select("*").order("display_order")).data || [],
  });

  const { data: record } = useQuery({
    queryKey: ["payslip", employeeId, year, month],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("salary_records")
        .select("*, salary_record_items(*)")
        .eq("employee_id", employeeId)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();
      return data;
    },
  });

  const employee = useMemo(() => employees.find((e: any) => e.id === employeeId), [employees, employeeId]);

  const itemsByComp = useMemo(() => {
    const m = new Map<string, number>();
    record?.salary_record_items?.forEach((it: any) => m.set(it.component_id, Number(it.amount)));
    return m;
  }, [record]);

  const earnings = components.filter((c: any) => c.type === "earning" && itemsByComp.has(c.id));
  const deductions = components.filter((c: any) => c.type === "deduction" && itemsByComp.has(c.id));
  const currency = company?.currency || "ج.م";

  const fmt = (n: number) => Number(n || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const numToWords = (n: number) => {
    // simple Arabic number-to-words (integer part)
    const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
    const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const below1000 = (x: number): string => {
      if (x === 0) return "";
      if (x < 20) return ones[x];
      if (x < 100) {
        const t = Math.floor(x / 10), o = x % 10;
        return o ? `${ones[o]} و${tens[t]}` : tens[t];
      }
      const h = Math.floor(x / 100), r = x % 100;
      const hStr = h === 1 ? "مائة" : h === 2 ? "مائتان" : `${ones[h]}مائة`;
      return r ? `${hStr} و${below1000(r)}` : hStr;
    };
    const int = Math.floor(n);
    if (int === 0) return "صفر";
    const parts: string[] = [];
    const millions = Math.floor(int / 1000000);
    const thousands = Math.floor((int % 1000000) / 1000);
    const rest = int % 1000;
    if (millions) parts.push(millions === 1 ? "مليون" : millions === 2 ? "مليونان" : `${below1000(millions)} مليون`);
    if (thousands) parts.push(thousands === 1 ? "ألف" : thousands === 2 ? "ألفان" : `${below1000(thousands)} ألف`);
    if (rest) parts.push(below1000(rest));
    return parts.join(" و");
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-3xl font-bold">مفردة المرتب</h1>
        <p className="text-muted-foreground mt-1">اطبع كشف مرتب لكل موظف على حدة</p>
      </div>

      <Card className="print:hidden">
        <CardContent className="pt-6 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label>الموظف</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="اختر موظف" /></SelectTrigger>
              <SelectContent>
                {employees.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.employee_code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>السنة</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(+v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button onClick={() => window.print()} disabled={!record}>
            <Printer className="w-4 h-4 ml-1" /> طباعة
          </Button>
        </CardContent>
      </Card>

      {!employeeId ? (
        <Card className="print:hidden"><CardContent className="py-12 text-center text-muted-foreground">اختر موظف لعرض مفردة المرتب</CardContent></Card>
      ) : !record ? (
        <Card className="print:hidden"><CardContent className="py-12 text-center text-muted-foreground">لا يوجد سجل مرتب لهذا الموظف في {MONTHS[month - 1]} {year}</CardContent></Card>
      ) : (
        <div className="payslip bg-white text-black mx-auto max-w-3xl p-8 border rounded-lg shadow-sm print:shadow-none print:border-0 print:max-w-full print:p-0" dir="rtl">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-black pb-4 mb-4">
            <div className="flex items-center gap-3">
              {company?.logo_url && <img src={company.logo_url} alt="logo" className="w-16 h-16 object-contain" />}
              <div>
                <div className="text-xl font-bold">{company?.company_name || "اسم الشركة"}</div>
                {company?.address && <div className="text-xs">{company.address}</div>}
                {company?.phone && <div className="text-xs">هاتف: {company.phone}</div>}
                {company?.tax_number && <div className="text-xs">رقم ضريبي: {company.tax_number}</div>}
              </div>
            </div>
            <div className="text-left">
              <div className="text-lg font-bold border-2 border-black px-3 py-1">مفردة مرتب</div>
              <div className="mt-2 text-sm font-semibold">{MONTHS[month - 1]} {year}</div>
            </div>
          </div>

          {/* Employee info */}
          <table className="w-full text-sm mb-4 border border-black border-collapse">
            <tbody>
              <tr>
                <td className="border border-black p-2 bg-gray-100 font-semibold w-1/4">اسم الموظف</td>
                <td className="border border-black p-2 w-1/4">{employee?.full_name}</td>
                <td className="border border-black p-2 bg-gray-100 font-semibold w-1/4">كود الموظف</td>
                <td className="border border-black p-2 w-1/4">{employee?.employee_code}</td>
              </tr>
              <tr>
                <td className="border border-black p-2 bg-gray-100 font-semibold">المسمى الوظيفي</td>
                <td className="border border-black p-2">{employee?.position || "—"}</td>
                <td className="border border-black p-2 bg-gray-100 font-semibold">القسم</td>
                <td className="border border-black p-2">{employee?.department || "—"}</td>
              </tr>
            </tbody>
          </table>

          {/* Earnings & Deductions */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <table className="w-full text-sm border border-black border-collapse">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black p-2 text-right">الاستحقاقات</th>
                  <th className="border border-black p-2 text-left w-32">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {earnings.length === 0 && <tr><td colSpan={2} className="border border-black p-2 text-center text-gray-500">—</td></tr>}
                {earnings.map((c: any) => (
                  <tr key={c.id}>
                    <td className="border border-black p-2">{c.name}</td>
                    <td className="border border-black p-2 text-left font-mono">{fmt(itemsByComp.get(c.id) || 0)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold">
                  <td className="border border-black p-2">إجمالي الاستحقاقات</td>
                  <td className="border border-black p-2 text-left font-mono">{fmt(Number(record.total_earnings))}</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full text-sm border border-black border-collapse">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black p-2 text-right">الاستقطاعات</th>
                  <th className="border border-black p-2 text-left w-32">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {deductions.length === 0 && <tr><td colSpan={2} className="border border-black p-2 text-center text-gray-500">—</td></tr>}
                {deductions.map((c: any) => (
                  <tr key={c.id}>
                    <td className="border border-black p-2">{c.name}</td>
                    <td className="border border-black p-2 text-left font-mono">{fmt(itemsByComp.get(c.id) || 0)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold">
                  <td className="border border-black p-2">إجمالي الاستقطاعات</td>
                  <td className="border border-black p-2 text-left font-mono">{fmt(Number(record.total_deductions))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net */}
          <table className="w-full text-sm border-2 border-black border-collapse mb-4">
            <tbody>
              <tr className="bg-gray-200">
                <td className="border border-black p-3 font-bold text-lg w-1/3">صافي المرتب</td>
                <td className="border border-black p-3 text-left font-mono font-bold text-lg">{fmt(Number(record.net_salary))} {currency}</td>
              </tr>
              <tr>
                <td className="border border-black p-2 font-semibold">فقط لا غير</td>
                <td className="border border-black p-2">{numToWords(Number(record.net_salary))} {currency}</td>
              </tr>
            </tbody>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-8 mt-12 text-sm text-center">
            <div>
              <div className="border-t border-black pt-2">توقيع الموظف</div>
            </div>
            <div>
              <div className="border-t border-black pt-2">المحاسب</div>
            </div>
            <div>
              <div className="border-t border-black pt-2">المدير</div>
            </div>
          </div>

          <div className="text-[10px] text-gray-500 mt-6 text-center print:block">
            طُبع في: {new Date().toLocaleDateString("ar-EG")}
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 1cm; }
          body * { visibility: hidden; }
          .payslip, .payslip * { visibility: visible; }
          .payslip { position: absolute; inset: 0; margin: 0 !important; }
        }
      `}</style>
    </div>
  );
}
