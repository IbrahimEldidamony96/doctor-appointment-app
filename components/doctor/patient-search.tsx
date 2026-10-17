"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Search, RotateCcw, UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchClinicPatients, type PatientSearchResult } from "@/actions/staff-patients";
import type { PatientPageSize, PatientProfileFilter, PatientSort } from "@/lib/patient-management";

type Filters = {
  query: string;
  profile: PatientProfileFilter;
  sort: PatientSort;
  pageSize: PatientPageSize;
};

const DEFAULT_FILTERS: Filters = {
  query: "", profile: "all", sort: "newest", pageSize: 10,
};
const selectClassName = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";
const registrationDate = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo", year: "numeric", month: "short", day: "numeric",
});

export function PatientSearch({ initialResult }: { initialResult: PatientSearchResult }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [result, setResult] = useState<PatientSearchResult>(initialResult);
  const [isPending, startTransition] = useTransition();
  const latestRequest = useRef(0);

  function run(nextFilters: Filters, page: number) {
    const requestId = ++latestRequest.current;
    const criteria = { ...nextFilters, query: nextFilters.query.trim() };
    startTransition(async () => {
      try {
        const response = await searchClinicPatients({ ...criteria, page });
        if (requestId !== latestRequest.current) return;
        setResult(response);
        if (response.success) setAppliedFilters(criteria);
      } catch {
        if (requestId === latestRequest.current) setResult({ success: false, error: "unknown" });
      }
    });
  }

  function changeFilters(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    run(next, 1);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(filters, 1);
  }

  function reset() {
    setFilters(DEFAULT_FILTERS);
    run(DEFAULT_FILTERS, 1);
  }

  const error = !result.success
    ? result.error === "forbidden" ? "مش مصرح لك بعرض سجلات المرضى."
      : result.error === "invalid_query" ? "راجع الفلاتر. اكتب حرفين على الأقل من الاسم أو 3 أرقام من بداية الموبايل، بحد أقصى 60 حرف."
      : "تعذر تحميل المرضى حاليًا. جرّب مرة تانية."
    : null;
  const data = result.success ? result : null;
  const firstResult = data && data.count > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastResult = data ? Math.min(data.page * data.pageSize, data.count) : 0;
  const firstPage = data ? Math.max(1, Math.min(data.page - 2, data.pages - 4)) : 1;
  const visiblePages = data
    ? Array.from({ length: Math.min(5, data.pages) }, (_, index) => firstPage + index)
    : [];
  const hasFilters = appliedFilters.query !== "" || appliedFilters.profile !== "all";

  return <div className="space-y-6" aria-busy={isPending}>
    <form onSubmit={submit} className="surface p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">بحث وتصفية المرضى</h2>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={isPending}>
          <RotateCcw size={15} aria-hidden="true"/> إعادة ضبط
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor="staff-patient-search" className="block text-sm font-bold">الاسم أو بداية رقم الموبايل</label>
          <Input id="staff-patient-search" value={filters.query} maxLength={60}
            autoComplete="off" placeholder="مثال: أحمد أو +2010" dir="auto" disabled={isPending}
            aria-describedby="staff-patient-search-help"
            onChange={event => setFilters(current => ({ ...current, query: event.target.value }))}/>
          <p id="staff-patient-search-help" className="text-xs text-muted-foreground">
            اترك البحث فارغًا لعرض كل المرضى، أو ابحث بحرفين من الاسم أو 3 أرقام من الموبايل.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="staff-patient-profile" className="block text-sm font-bold">حالة الاسم</label>
          <select id="staff-patient-profile" className={selectClassName} value={filters.profile}
            disabled={isPending}
            onChange={event => changeFilters({ profile: event.target.value as PatientProfileFilter })}>
            <option value="all">كل المرضى</option>
            <option value="named">الاسم مسجل</option>
            <option value="unnamed">بدون اسم</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="staff-patient-sort" className="block text-sm font-bold">ترتيب حسب</label>
          <select id="staff-patient-sort" className={selectClassName} value={filters.sort}
            disabled={isPending}
            onChange={event => changeFilters({ sort: event.target.value as PatientSort })}>
            <option value="newest">الأحدث تسجيلًا</option>
            <option value="oldest">الأقدم تسجيلًا</option>
            <option value="name_asc">الاسم: تصاعدي</option>
            <option value="name_desc">الاسم: تنازلي</option>
            <option value="phone_asc">الموبايل: تصاعدي</option>
            <option value="phone_desc">الموبايل: تنازلي</option>
          </select>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t pt-4">
        <div className="flex items-center gap-3">
          <label htmlFor="staff-patient-page-size" className="text-sm font-bold">مرضى في الصفحة</label>
          <select id="staff-patient-page-size" className={selectClassName + " w-24"} value={filters.pageSize}
            disabled={isPending}
            onChange={event => changeFilters({ pageSize: Number(event.target.value) as PatientPageSize })}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
        <Button type="submit" disabled={isPending}>
          <Search size={17} aria-hidden="true"/>{isPending ? "جاري التحديث..." : "تطبيق البحث"}
        </Button>
      </div>
    </form>

    {error && <p role="alert" className="status-error">{error}</p>}
    {data && <section className="surface space-y-4 p-5 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">سجل المرضى</h2>
        <p className="text-sm text-muted-foreground" role="status">
          {isPending ? "جاري تحديث المرضى..." : "عرض " + firstResult + "–" + lastResult + " من " + data.count + " مريض"}
        </p>
      </div>
      {data.patients.length === 0 ?
        <p className="py-9 text-center text-sm text-slate-500">
          {hasFilters ? "لا يوجد مرضى مطابقون للفلاتر الحالية." : "لا يوجد مرضى مسجلون حتى الآن."}
        </p> :
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-right text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-3 font-bold">المريض</th>
                <th scope="col" className="px-2 py-3 font-bold">الموبايل</th>
                <th scope="col" className="px-2 py-3 font-bold">تاريخ التسجيل</th>
                <th scope="col" className="px-2 py-3 font-bold"><span className="sr-only">ملف المريض</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.patients.map(patient => <tr key={patient.id} className="hover:bg-slate-50/60">
                <td className="px-2 py-4">
                  <Link href={"/dashboard/patients/" + patient.id} className="inline-flex items-center gap-3 font-bold hover:text-teal-800">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                      <UserRound size={19} aria-hidden="true"/>
                    </span>
                    <span>{patient.name?.trim() || "بدون اسم"}</span>
                  </Link>
                </td>
                <td className="px-2 py-4 text-slate-600"><bdi dir="ltr">{patient.phone}</bdi></td>
                <td className="whitespace-nowrap px-2 py-4 text-slate-600">
                  <time dateTime={patient.created_at}>{registrationDate.format(new Date(patient.created_at))}</time>
                </td>
                <td className="px-2 py-4">
                  <Link href={"/dashboard/patients/" + patient.id}
                    aria-label={"عرض ملف " + (patient.name?.trim() || patient.phone)}
                    className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-teal-700 hover:text-teal-900">
                    عرض الملف <ChevronLeft size={16} aria-hidden="true"/>
                  </Link>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      {data.pages > 1 && <nav aria-label="صفحات المرضى" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button type="button" variant="outline" size="sm"
          disabled={isPending || data.page <= 1} onClick={() => run(appliedFilters, data.page - 1)}>
          <ChevronRight size={17} aria-hidden="true"/> السابق
        </Button>
        <span className="text-sm font-bold sm:hidden">الصفحة {data.page} من {data.pages}</span>
        <div className="hidden items-center gap-1 sm:flex">
          {firstPage > 1 && <>
            <Button type="button" variant="outline" size="sm" disabled={isPending}
              aria-label="الصفحة 1" onClick={() => run(appliedFilters, 1)}>1</Button>
            {firstPage > 2 && <span aria-hidden="true" className="px-1">…</span>}
          </>}
          {visiblePages.map(page => <Button key={page} type="button"
            variant={page === data.page ? "default" : "outline"} size="sm"
            aria-label={"الصفحة " + page} aria-current={page === data.page ? "page" : undefined}
            disabled={isPending || page === data.page} onClick={() => run(appliedFilters, page)}>
            {page}
          </Button>)}
          {visiblePages[visiblePages.length - 1] < data.pages && <>
            {visiblePages[visiblePages.length - 1] < data.pages - 1 && <span aria-hidden="true" className="px-1">…</span>}
            <Button type="button" variant="outline" size="sm" disabled={isPending}
              aria-label={"الصفحة " + data.pages} onClick={() => run(appliedFilters, data.pages)}>{data.pages}</Button>
          </>}
        </div>
        <Button type="button" variant="outline" size="sm"
          disabled={isPending || data.page >= data.pages} onClick={() => run(appliedFilters, data.page + 1)}>
          التالي <ChevronLeft size={17} aria-hidden="true"/>
        </Button>
      </nav>}
    </section>}
  </div>;
}
