"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addAvailability,
  deleteAvailability,
  toggleAvailabilityActive,
  addBlockedDate,
  deleteBlockedDate,
} from "@/actions/doctor-availability";

const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

type AvailabilityRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
};

type BlockedDateRow = {
  id: string;
  date: string;
  is_full_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

type Props = {
  initialAvailability: AvailabilityRow[];
  initialBlockedDates: BlockedDateRow[];
};

export function AvailabilityManager({
  initialAvailability,
  initialBlockedDates,
}: Props) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [blockedDates, setBlockedDates] = useState(initialBlockedDates);
  const [isPending, startTransition] = useTransition();

  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState(30);

  const [blockDate, setBlockDate] = useState("");
  const [isFullDay, setIsFullDay] = useState(true);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [reason, setReason] = useState("");

  // Simplest approach for a portfolio project: the server action already
  // revalidates the path, so a full reload guarantees fresh data without
  // hand-rolling optimistic inserts for the "add" forms.
  function handleAddAvailability() {
    startTransition(async () => {
      const result = await addAvailability({
        dayOfWeek,
        startTime,
        endTime,
        slotDurationMinutes: slotDuration,
      });
      if (result.success) window.location.reload();
    });
  }

  function handleDeleteAvailability(id: string) {
    startTransition(async () => {
      await deleteAvailability(id);
      setAvailability((prev) => prev.filter((a) => a.id !== id));
    });
  }

  function handleToggleActive(id: string, current: boolean) {
    startTransition(async () => {
      await toggleAvailabilityActive(id, !current);
      setAvailability((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_active: !current } : a))
      );
    });
  }

  function handleAddBlockedDate() {
    startTransition(async () => {
      const result = await addBlockedDate({
        date: blockDate,
        isFullDay,
        startTime: isFullDay ? undefined : blockStart,
        endTime: isFullDay ? undefined : blockEnd,
        reason: reason || undefined,
      });
      if (result.success) window.location.reload();
    });
  }

  function handleDeleteBlockedDate(id: string) {
    startTransition(async () => {
      await deleteBlockedDate(id);
      setBlockedDates((prev) => prev.filter((b) => b.id !== id));
    });
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="font-medium">الأوقات الأسبوعية</h2>

        <ul className="space-y-2">
          {availability.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-lg border p-3 text-sm"
            >
              <span>
                {dayNames[a.day_of_week]} — {a.start_time.slice(0, 5)} إلى{" "}
                {a.end_time.slice(0, 5)} ({a.slot_duration_minutes} دقيقة)
                {!a.is_active && " — متوقف"}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => handleToggleActive(a.id, a.is_active)}
                >
                  {a.is_active ? "إيقاف" : "تفعيل"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleDeleteAvailability(a.id)}
                >
                  حذف
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <Label className="mb-1 block">اليوم</Label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
            >
              {dayNames.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block">من</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block">إلى</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block">مدة الكشف (دقيقة)</Label>
            <Input
              type="number"
              value={slotDuration}
              onChange={(e) => setSlotDuration(Number(e.target.value))}
            />
          </div>
          <Button disabled={isPending} onClick={handleAddAvailability} className="w-full">
            إضافة
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-medium">أيام مستثناة</h2>

        <ul className="space-y-2">
          {blockedDates.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-lg border p-3 text-sm"
            >
              <span>
                {b.date} —{" "}
                {b.is_full_day
                  ? "يوم كامل"
                  : `${b.start_time?.slice(0, 5)} إلى ${b.end_time?.slice(0, 5)}`}
                {b.reason && ` — ${b.reason}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => handleDeleteBlockedDate(b.id)}
              >
                حذف
              </Button>
            </li>
          ))}
        </ul>

        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <Label className="mb-1 block">التاريخ</Label>
            <Input
              type="date"
              value={blockDate}
              onChange={(e) => setBlockDate(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isFullDay}
              onChange={(e) => setIsFullDay(e.target.checked)}
            />
            يوم كامل
          </label>
          {!isFullDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block">من</Label>
                <Input
                  type="time"
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1 block">إلى</Label>
                <Input
                  type="time"
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                />
              </div>
            </div>
          )}
          <div>
            <Label className="mb-1 block">السبب (اختياري)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button disabled={isPending} onClick={handleAddBlockedDate} className="w-full">
            إضافة استثناء
          </Button>
        </div>
      </section>
    </div>
  );
}
