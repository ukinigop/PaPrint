import { useEffect, useMemo, useState } from "react";
import * as api from "./api";
import { createQuoteLoader, type Quote, type QuoteState } from "./customerFlow";

export function useQuote(body: string, enabled: boolean) {
  const [state, setState] = useState<QuoteState>({ key: "", status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const loader = useMemo(
    () =>
      createQuoteLoader(
        (body) => api.request<Quote>("/quote", { method: "POST", body }),
        setState,
      ),
    [],
  );
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      void loader.load(body);
    }, 300);
    return () => {
      clearTimeout(timer);
      loader.invalidate();
    };
  }, [body, enabled, attempt, loader]);
  // Hide a previous estimate as soon as inputs change, before the debounce runs.
  const quote: QuoteState = !enabled
    ? { key: body, status: "idle" }
    : state.key === body
      ? state
      : { key: body, status: "loading" };
  return { ...quote, retry: () => setAttempt((n) => n + 1) };
}
