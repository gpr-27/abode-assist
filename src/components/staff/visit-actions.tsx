"use client";
import { ActionButton } from "./action-ui";
import { markVisit } from "@/app/staff/actions";

export function OutcomeButtons({ visitId }: { visitId: string }) {
  return (
    <span className="flex flex-wrap gap-2">
      <ActionButton action={markVisit.bind(null, visitId, "visited")} tone="primary">Visited</ActionButton>
      <ActionButton action={markVisit.bind(null, visitId, "no_show")}>No show</ActionButton>
    </span>
  );
}
