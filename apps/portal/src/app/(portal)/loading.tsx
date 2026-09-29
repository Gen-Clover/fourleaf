/** Shown instantly on navigation while the server renders the next page. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-6">
        <div className="h-7 w-56 rounded-md bg-neutral-100" />
        <div className="mt-2 h-4 w-80 rounded bg-neutral-100" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-24 p-4">
            <div className="h-3 w-24 rounded bg-neutral-100" />
            <div className="mt-3 h-6 w-32 rounded bg-neutral-100" />
          </div>
        ))}
      </div>
      <div className="card h-72" />
    </div>
  );
}
