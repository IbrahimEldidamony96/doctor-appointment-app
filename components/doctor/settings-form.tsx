"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings } from "@/actions/doctor-settings";

type Props = {
  initial: {
    clinicName: string;
    bookingWindowDays: number;
    cancellationNoticeHours: number;
    defaultSlotMinutes: number;
    doctorNotificationPhone: string;
    consultationPrice: number;
  };
};

export function SettingsForm({ initial }: Props) {
  const [clinicName, setClinicName] = useState(initial.clinicName);
  const [bookingWindowDays, setBookingWindowDays] = useState(initial.bookingWindowDays);
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState(
    initial.cancellationNoticeHours
  );
  const [defaultSlotMinutes, setDefaultSlotMinutes] = useState(initial.defaultSlotMinutes);
  const [doctorNotificationPhone, setDoctorNotificationPhone] = useState(
    initial.doctorNotificationPhone
  );
  const [consultationPrice, setConsultationPrice] = useState(initial.consultationPrice);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateSettings({
        clinicName,
        bookingWindowDays,
        cancellationNoticeHours,
        defaultSlotMinutes,
        doctorNotificationPhone,
        consultationPrice,
      });
      setMessage(result.success ? "تم الحفظ" : "حصل خطأ، حاول تاني");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="clinicName" className="mb-1 block">
          اسم العيادة
        </Label>
        <Input
          id="clinicName"
          value={clinicName}
          onChange={(e) => setClinicName(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="bookingWindow" className="mb-1 block">
          أقصى عدد أيام يقدر المريض يحجز فيها مقدمًا
        </Label>
        <Input
          id="bookingWindow"
          type="number"
          value={bookingWindowDays}
          onChange={(e) => setBookingWindowDays(Number(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="cancellationNotice" className="mb-1 block">
          أقل مدة إشعار قبل الإلغاء (بالساعات)
        </Label>
        <Input
          id="cancellationNotice"
          type="number"
          value={cancellationNoticeHours}
          onChange={(e) => setCancellationNoticeHours(Number(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="slotMinutes" className="mb-1 block">
          مدة الكشف الافتراضية (دقيقة)
        </Label>
        <Input
          id="slotMinutes"
          type="number"
          value={defaultSlotMinutes}
          onChange={(e) => setDefaultSlotMinutes(Number(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="doctorPhone" className="mb-1 block">
          رقم الواتساب لاستلام تنبيهات الحجز الجديد
        </Label>
        <Input
          id="doctorPhone"
          type="tel"
          dir="ltr"
          placeholder="+20xxxxxxxxxx"
          value={doctorNotificationPhone}
          onChange={(e) => setDoctorNotificationPhone(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="consultationPrice" className="mb-1 block">
          سعر الكشف (جنيه)
        </Label>
        <Input
          id="consultationPrice"
          type="number"
          value={consultationPrice}
          onChange={(e) => setConsultationPrice(Number(e.target.value))}
        />
      </div>

      {message && <p className="text-sm">{message}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? "جاري الحفظ..." : "حفظ"}
      </Button>
    </div>
  );
}
