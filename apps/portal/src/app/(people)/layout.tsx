import ToolShell from "@/components/ToolShell";
import { peopleNav } from "@genclover/people/nav";

export const dynamic = "force-dynamic";

/** People: employees, contractors, documents, work orders. */
export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return <ToolShell tool={peopleNav}>{children}</ToolShell>;
}
