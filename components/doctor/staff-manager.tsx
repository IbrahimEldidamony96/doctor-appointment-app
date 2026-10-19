"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addStaff, setStaffActive } from "@/actions/staff";
import type { ClinicRole } from "@/lib/auth/permissions";

type Staff = {
  id: string;
  phone: string | null;
  display_name: string;
  role: ClinicRole;
  is_active: boolean;
  is_owner: boolean;
  created_at: string;
};

const roleLabels: Record<ClinicRole, string> = {
  doctor: "طبيب", nurse: "تمريض", secretary: "سكرتارية",
};

const messages: Record<string, string> = {
  forbidden: "مش مسموح بتعديل حسابات فريق العيادة.",
  invalid_input: "راجع اسم الموظف ورقم الواتساب والصلاحية.",
  already_exists: "الرقم مسجّل بالفعل؛ تقدر تفعّله من الجدول.",
  not_found: "الحساب غير موجود.",
  owner_protected: "لا يمكن تعطيل حساب مالك العيادة.",
  unknown: "حصل خطأ في السيرفر، حاول مرة تانية.",
};

export function StaffManager({ initialStaff, currentActorId }: { initialStaff: Staff[]; currentActorId: string }) {
  const [staff, setStaff] = useState(initialStaff);
  const [phone, setPhone] = useState("+20");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ClinicRole>("secretary");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const normalizedPhone = phone.replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      setNotice("اكتب رقم واتساب صحيح مع مفتاح الدولة، مثل +201xxxxxxxxx.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await addStaff({ phone: normalizedPhone, displayName: name.trim(), role });
        if (!result.success) { setNotice(messages[result.error] ?? messages.unknown); return; }
        setStaff(list => [result.staff, ...list]);
        setPhone("+20"); setName(""); setRole("secretary");
        setNotice("تم إضافة الحساب. الموظف يدخل من نفس صفحة تسجيل الدخول باستخدام رقم الواتساب ده.");
      } catch { setNotice("تعذر الاتصال بالسيرفر."); }
    });
  }

  function toggle(item: Staff) {
    if (item.is_owner || item.id === currentActorId || !item.phone) return;
    setNotice("");
    startTransition(async () => {
      try {
        const result = await setStaffActive({ id: item.id, isActive: !item.is_active });
        if (!result.success) { setNotice(messages[result.error] ?? messages.unknown); return; }
        setStaff(list => list.map(row =>
          row.id === item.id ? { ...row, is_active: !item.is_active } : row));
      } catch { setNotice("تعذر الاتصال بالسيرفر."); }
    });
  }

  return <div className="space-y-8">
    <section className="surface-sm space-y-5 p-6">
      <h2 className="text-lg font-extrabold">إضافة حساب لفريق العيادة</h2>
      <p className="text-sm leading-7 text-muted-foreground">أضف اسم الموظف ورقم الواتساب وحدد دوره. هيستخدم نفس صفحة تسجيل الدخول وكود التحقق، من غير مشاركة حساب الطبيب.</p>
      <form onSubmit={add} className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="block space-y-2 text-sm font-bold">
          اسم الموظف
          <Input required minLength={2} maxLength={100} value={name} disabled={isPending}
            placeholder="اسم الموظف" onChange={event => setName(event.target.value)}/>
        </label>
        <label className="block space-y-2 text-sm font-bold">
          رقم الواتساب
          <Input required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} disabled={isPending}
            placeholder="+201xxxxxxxxx" onChange={event => setPhone(event.target.value)}/>
        </label>
        <label className="block space-y-2 text-sm font-bold">
          الدور
          <select value={role} disabled={isPending} onChange={event => setRole(event.target.value as ClinicRole)}
            className="h-10 w-full rounded-xl border border-input bg-white px-3 text-sm font-normal">
            <option value="doctor">طبيب</option><option value="nurse">تمريض</option><option value="secretary">سكرتارية</option>
          </select>
        </label>
        <Button type="submit" disabled={isPending}>إضافة الحساب</Button>
      </form>
    </section>
    {notice && <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm font-medium">{notice}</p>}
    <section className="surface-sm overflow-x-auto p-6">
      <h2 className="mb-5 text-lg font-extrabold">حسابات فريق العيادة</h2>
      {!staff.length ? <p className="text-sm text-muted-foreground">مفيش حسابات لفريق العيادة لسه.</p> :
        <table className="w-full text-right text-sm">
          <thead><tr className="border-b text-slate-500">
            <th scope="col" className="py-3">الاسم</th><th scope="col">رقم الواتساب</th><th scope="col">الدور</th><th scope="col">الحالة</th><th scope="col">التحكم</th>
          </tr></thead>
          <tbody>{staff.map(item => <tr key={item.id} className="border-b last:border-0">
            <td className="py-4 font-bold">{item.display_name}{item.is_owner && <span className="ms-2 text-xs text-teal-700">مالك العيادة</span>}</td>
            <td className="px-2 font-mono text-xs" dir="ltr">{item.phone ?? "—"}</td>
            <td className="px-2">{roleLabels[item.role]}</td>
            <td>{item.is_active ? "مفعّل" : "معطّل"}</td>
            <td className="py-2">{item.is_owner ? <span className="text-xs text-slate-500">حساب المالك</span> : item.id === currentActorId ? <span className="text-xs text-slate-500">حسابك الحالي</span> : !item.phone ? <span className="text-xs text-slate-500">رقم الواتساب غير مسجل</span> :
              <Button variant={item.is_active ? "destructive" : "outline"} size="sm"
                disabled={isPending} onClick={() => toggle(item)}>{item.is_active ? "تعطيل" : "تفعيل"}</Button>}</td>
          </tr>)}</tbody>
        </table>}
    </section>
  </div>;
}
