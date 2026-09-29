"use client";

export default function PrintButton() {
  return (
    <button className="btn-secondary btn-sm mt-2 print:hidden" onClick={() => window.print()}>
      Print / Save PDF
    </button>
  );
}
