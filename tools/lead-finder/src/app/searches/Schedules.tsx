import Link from "next/link";
import { date } from "@genclover/ui/format";
import { deleteSchedule, runScheduleNow, setScheduleActive } from "../actions";

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

type Schedule = { id: string; name: string; dayOfWeek: number; hour: number; active: boolean; nextRunAt: Date; lastRunAt: Date | null; lastSearchId: string | null };

/** Weekly searches: each run adds only businesses that are new. */
export default function Schedules({ schedules, canEdit }: { schedules: Schedule[]; canEdit: boolean }) {
  if (!schedules.length) return null;
  return (
    <div className="card mb-6">
      <div className="card-h">
        <div className="card-t">Weekly searches</div>
        <span className="text-xs text-neutral-500">Set up with &quot;Repeat every week&quot; on New search</span>
      </div>
      <ul className="divide-y divide-neutral-100">
        {schedules.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-neutral-900">{s.name}</div>
              <div className="text-xs text-neutral-500">
                {DAYS[s.dayOfWeek]} at {String(s.hour).padStart(2, "0")}:00 IST · {s.active ? `next ${date(s.nextRunAt)}` : "paused"}
                {s.lastSearchId && (
                  <>
                    {" · "}
                    <Link className="hover:underline" href={`/leads/searches/${s.lastSearchId}`}>last run {s.lastRunAt ? date(s.lastRunAt) : ""}</Link>
                  </>
                )}
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <form action={runScheduleNow.bind(null, s.id)}><button className="btn-secondary btn-sm" disabled={!s.active}>Run now</button></form>
                <form action={setScheduleActive.bind(null, s.id, !s.active)}><button className="btn-secondary btn-sm">{s.active ? "Pause" : "Resume"}</button></form>
                <form action={deleteSchedule.bind(null, s.id)}><button className="btn-danger btn-sm" aria-label={`Delete ${s.name}`}>✕</button></form>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
