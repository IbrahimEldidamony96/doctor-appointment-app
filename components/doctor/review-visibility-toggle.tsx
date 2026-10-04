"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleReviewPublished } from "@/actions/doctor-reviews";

type Props = {
  reviewId: string;
  isPublished: boolean;
};

export function ReviewVisibilityToggle({ reviewId, isPublished }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      toggleReviewPublished(reviewId, !isPublished);
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={handleClick}>
      {isPublished ? "إخفاء" : "إظهار"}
    </Button>
  );
}
