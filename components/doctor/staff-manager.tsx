"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSecretary, setSecretaryActive } from "@/actions/staff";

type Staff = {
  clerk_user_id: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
};

const messages: Record<string, string> = {
  forbidden: "مش مسموح بتعديل صلاحيات السكرتارية.",
  invalid_input: "راجع اسم السكرتير أو Clerk User ID.",
  already_exists: "الحساب مسجّل بالفعل؛ تقدر تفعّله من الجدول.",
  user_not_found: "Clerk User ID مش موجود أو الحساب محظور.",
  not_found: "الحساب غير موجود.",
  unknown: "حصل خطأ في السيرفر، حاول مرة تانية.",
};

export function StaffManager({ initialStaff }: { initialStaff: Staff[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    startTransition(async () => {
      try {
        const result = await addSecretary({ clerkUserId: userId.trim(), displayName: name.trim() });
        if (!result.success) { setNotice(messages[result.error]); return; }
        setStaff(list => [{
          clerk_user_id: userId.trim(), display_name: name.trim(),
          is_active: true, created_at: new Date().toISOString(),
        }, ...list]);
        setUserId(""); setName("");
        setNotice("تم إضافة الحساب. يقدر يسجل الدخول باستخدام حساب Clerk بتاعه.");
      } catch { setNotice("تعذر الاتصال بالسيرفر."); }
    });
  }

  function toggle(item: Staff) {
    setNotice("");
    startTransition(async () => {
      try {
        const result = await setSecretaryActive({ clerkUserId: item.clerk_user_id, isActive: !item.is_active });
        if (!result.success) { setNotice(messages[result.error]); return; }
        setStaff(list => list.map(row =>
          row.clerk_user_id === item.clerk_user_id ? { ...row, is_active: !item.is_active } : row));
      } catch { setNotice("تعذر الاتصال بالسيرفر."); }
    });
  }

  return <div className="space-y-8">
    <section className="surface-sm space-y-5 p-6">
      <h2 className="text-lg font-extrabold">إضافة حساب سكرتارية</h2>
      <p className="text-sm leading-7 text-muted-foreground">
        الموظف لازم يكون عنده حساب Clerk موجود مسبقًا. هات User ID بتاعه من Clerk Dashboard → Users،
        وبعد إضافته هنا يدخل من صفحة تسجيل دخول الطبيب. مش محتاج تديله بيانات دخول الطبيب.
      </p>
      <form onSubmit={add} className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="block space-y-2 text-sm font-bold">
          اسم الموظف
          <Input required minLength={2} maxLength={100} value={name}
            placeholder="اسم السكرتير" onChange={e => setName(e.target.value)}/>
        </label>
        <label className="block space-y-2 text-sm font-bold">
          Clerk User ID
          <Input required dir="ltr" value={userId} placeholder="user_..."
            onChange={e => setUserId(e.target.value)}/>
        </label>
        <Button type="submit" disabled={isPending}>إضافة سكرتارية</Button>
      </form>
    </section>
    {notice && <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm font-medium">{notice}</p>}
    <section className="surface-sm overflow-x-auto p-6">
      <h2 className="mb-5 text-lg font-extrabold">حسابات السكرتارية</h2>
      {!staff.length ? <p className="text-sm text-muted-foreground">مفيش حسابات سكرتارية لسه.</p> :
        <table className="w-full text-right text-sm">
          <thead><tr className="border-b text-slate-500">
            <th className="py-3">الاسم</th><th>Clerk ID</th><th>الحالة</th><th>التحكم</th>
          </tr></thead>
          <tbody>{staff.map(item => <tr key={item.clerk_user_id} className="border-b last:border-0">
            <td className="py-4 font-bold">{item.display_name}</td>
            <td className="max-w-48 truncate px-2 font-mono text-xs" dir="ltr" title={item.clerk_user_id}>{item.clerk_user_id}</td>
            <td>{item.is_active ? "مفعّل" : "معطّل"}</td>
            <td><Button variant={item.is_active ? "destructive" : "outline"} size="sm"
              disabled={isPending} onClick={() => toggle(item)}>{item.is_active ? "تعطيل" : "تفعيل"}</Button></td>
          </tr>)}</tbody>
        </table>}
    </section>
  </div>;
}
