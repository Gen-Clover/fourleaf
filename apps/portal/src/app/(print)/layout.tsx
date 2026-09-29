/** Printed documents (invoices, quotes) are always light, whatever theme the portal is in. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen bg-surface text-neutral-900 [color-scheme:light]">
      {children}
    </div>
  );
}
