"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Search, UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchClinicPatients, type PatientSearchResult } from "@/actions/staff-patients";

export function PatientSearch() {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<PatientSearchResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(termValue: string, page: number) {
    startTransition(async () => {
      try {
        const response = await searchClinicPatients({ query: termValue, page });
        setResult(response);
        if (response.success) setTerm(termValue);
      } catch {
        setResult({ success: false, error: "unknown" });
      }
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(query.trim(), 1);
  }

  const error = result && !result.success
    ? result.error === "forbidden" ? "مش مصرح لك بالبحث في سجلات المرضى."
      : result.error === "invalid_query" ? "اكتب على الأقل حرفين من الاسم، أو 3 أرقام من رقم الموبايل (بحد أقصى 60 حرف)."
      : "تعذر البحث حاليًا. جرّب مرة تانية."
    : null;

  return <div className="space-y-6">
    <form onSubmit={submit} className="surface p-5 sm:p-6">
      <label htmlFor="staff-patient-search" className="mb-3 block text-sm font-bold">ابحث بالاسم أو بداية رقم الموبايل</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input id="staff-patient-search" value={query} maxLength={60}
          autoComplete="off" placeholder="مثال: أحمد أو +2010" dir="auto"
          onChange={event => setQuery(event.target.value)} />
        <Button type="submit" disabled={isPending}><Search size={17}/>{isPending ? "جاري البحث..." : "بحث"}</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">البحث بيتم بصلاحية موظف العيادة. مش بنعرض كل المرضى تلقائيًا.</p>
    </form>
    {error && <p role="alert" className="status-error">{error}</p>}
    {result?.success && <section className="surface space-y-4 p-5 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">نتائج البحث</h2>
        <span className="text-xs text-muted-foreground">عدد النتائج: {result.count}</span>
      </div>
      {result.patients.length === 0 ?
        <p className="py-7 text-center text-sm text-slate-500">مفيش مرضى مطابقين لبحثك.</p> :
        <ul className="divide-y">
          {result.patients.map(patient => <li key={patient.id}>
            <Link href={"/dashboard/patients/" + patient.id}
              className="flex items-center gap-3 py-4 hover:text-teal-800">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <UserRound size={19}/>
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{patient.name ?? "بدون اسم"}</b>
                <span className="mt-1 block text-xs text-slate-500" dir="ltr">{patient.phone}</span>
              </span>
              <ChevronLeft size={18}/>
            </Link>
          </li>)}
        </ul>}
      {result.pages > 1 && <nav aria-label="صفحات المرضى" className="flex items-center justify-between gap-3 border-t pt-4">
        <Button type="button" variant="outline" size="sm"
          disabled={isPending || result.page <= 1}
          onClick={() => run(term, result.page - 1)}>
          <ChevronRight size={17}/> السابق
        </Button>
        <span className="text-sm font-bold">{result.page} / {result.pages}</span>
        <Button type="button" variant="outline" size="sm"
          disabled={isPending || result.page >= result.pages || result.page >= 1000}
          onClick={() => run(term, result.page + 1)}>
          التالي <ChevronLeft size={17}/>
        </Button>
      </nav>}
    </section>}
  </div>;
}
