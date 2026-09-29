import { CloverMark, Wordmark } from "@genclover/ui/brand";
import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="gc-grid relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute top-1/3 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/15 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <CloverMark className="mb-4 h-14 w-14" />
          <h1 className="sr-only">Gen Clover Portal</h1>
          <Wordmark className="text-lg" />
          <div className="eyebrow mt-3">Internal portal</div>
          <p className="mt-2 text-sm text-neutral-500">Rate card · Pricing · Projects · Billing</p>
        </div>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
