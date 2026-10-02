import ToolShell from "@/components/ToolShell";
import { deliveryNav } from "@genclover/delivery/nav";

export const dynamic = "force-dynamic";

/** Delivery & Resources: projects, timesheets, resources. */
export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return <ToolShell tool={deliveryNav}>{children}</ToolShell>;
}
