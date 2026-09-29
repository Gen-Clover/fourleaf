import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-bold text-white">GC</div>
          <h1 className="text-xl font-semibold text-white">Gen Clover Portal</h1>
          <p className="text-sm text-neutral-400">Rate card · Pricing · Projects · Billing</p>
        </div>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
