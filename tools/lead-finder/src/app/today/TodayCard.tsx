"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Composer, type MessageOption } from "../Composer";
import { RepliedButton } from "../ClaudePanel";
import { markNotAFit, skipForToday } from "../moreActions";

type Props = {
  id: string;
  kind: "REPLY" | "FOLLOW_UP" | "NEW";
  options: MessageOption[];
  whatsapp: string | null;
  email: string | null;
  emailFirst: boolean;
  smtp: boolean;
};

/** One lead in the Today queue: send, or mark replied / skip / not a fit; the next lead appears. */
export default function TodayCard({ id, kind, options, whatsapp, email, emailFirst, smtp }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  return (
    <div className="space-y-4">
      {kind !== "REPLY" && (
        <Composer
          // Remount per lead so the editor starts with this lead's message.
          key={id}
          leadId={id}
          options={options}
          whatsapp={whatsapp}
          email={email}
          emailFirst={emailFirst}
          smtp={smtp}
          doNotContact={false}
          canEdit
          onSent={() => router.refresh()}
        />
      )}
      <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
        {kind !== "NEW" && kind !== "REPLY" && <RepliedButton id={id} small />}
        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => act(() => skipForToday(id))}>
          {kind === "REPLY" ? "Handled for today" : "Skip for today"}
        </button>
        {kind !== "REPLY" && (
          <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => act(() => markNotAFit(id))}>
            Not a fit
          </button>
        )}
        <Link href={`/leads/${id}`} className="btn-secondary btn-sm">Open lead page →</Link>
      </div>
    </div>
  );
}
