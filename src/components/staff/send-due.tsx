"use client";
import { ActionButton } from "./action-ui";
import { sendDueNow } from "@/app/staff/actions";

export function SendDueButton() {
  return <ActionButton action={sendDueNow} tone="primary" pendingLabel="Sending…">Send due messages now</ActionButton>;
}
