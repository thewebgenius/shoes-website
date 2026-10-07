"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
