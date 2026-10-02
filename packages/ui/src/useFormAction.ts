"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

/**
 * A server action for a form, without React's automatic form reset. With <form action={…}> React 19 clears
 * every field after each submit, so an error message ("GSTIN is from another state") would also wipe what
 * was typed. Spread `form` on the <form>: fields keep their values on an error; `resetOnSuccess` clears them
 * after a successful save (for "add another" forms).
 */
export function useFormAction<S>(fn: (prev: S, fd: FormData) => Promise<S>, opts: { resetOnSuccess?: boolean } = {}) {
  // Every form starts with no message; the actions all accept `undefined` as their previous state.
  const [state, dispatch, pending] = useActionState(fn as (prev: Awaited<S>, fd: FormData) => Promise<Awaited<S>>, undefined as Awaited<S>);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (opts.resetOnSuccess && (state as { ok?: boolean } | undefined)?.ok) ref.current?.reset();
  }, [state, opts.resetOnSuccess]);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(fd));
  };
  return { state, pending, form: { ref, onSubmit } };
}
