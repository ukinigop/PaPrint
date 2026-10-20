import type { Order, PrintFile, Settings, Shop } from "./types";

export const defaults: Settings = {
  paper: "A4",
  color: "Black & white",
  sides: "Single-sided",
  copies: 1,
  pageRange: "",
  finishing: "No binding",
};
export type Draft = {
  shop: Shop | null;
  files: PrintFile[];
  settings: Settings;
  notes: string;
  requestKey: string;
};
export function emptyDraft(): Draft {
  return {
    shop: null,
    files: [],
    settings: { ...defaults },
    notes: "",
    requestKey: "",
  };
}
export function completeDraft(draft: Draft, requestKey: string): Draft {
  return draft.requestKey === requestKey ? emptyDraft() : draft;
}
export async function placeBooking(
  draft: Draft,
  amount: number,
  request: (body: string) => Promise<Order>,
): Promise<
  { order: Order; amount?: never } | { amount: number; order?: never }
> {
  try {
    const order = await request(
      JSON.stringify({
        shopId: draft.shop?._id,
        fileIds: draft.files.map((f) => f._id),
        settings: draft.settings,
        notes: draft.notes,
        requestKey: draft.requestKey,
        paymentMethod: "pickup",
        expectedAmount: amount,
      }),
    );
    return { order };
  } catch (error) {
    const changed = error as Error & { code?: string; amount?: number };
    if (changed.code === "PRICE_CHANGED" && typeof changed.amount === "number")
      return { amount: changed.amount };
    throw error;
  }
}

export class StaleSessionError extends Error {
  constructor() {
    super("This session changed. Please try again in your current account.");
    this.name = "StaleSessionError";
  }
}
export function createSessionScope() {
  let revision = 0;
  return {
    invalidate() {
      revision++;
    },
    capture() {
      const current = revision;
      return () => current === revision;
    },
  };
}

export type Quote = { amount: number; pages: number };
export type QuoteState = {
  key: string;
  status: "idle" | "loading" | "success" | "error";
  quote?: Quote;
  error?: string;
};
export function createQuoteLoader(
  request: (body: string) => Promise<Quote>,
  publish: (state: QuoteState) => void,
) {
  const scope = createSessionScope();
  return {
    invalidate: scope.invalidate,
    async load(key: string) {
      scope.invalidate();
      const current = scope.capture();
      publish({ key, status: "loading" });
      try {
        const quote = await request(key);
        if (current()) publish({ key, status: "success", quote });
      } catch (error) {
        if (current() && !(error instanceof StaleSessionError))
          publish({
            key,
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Could not calculate the total. Please retry.",
          });
      }
    },
  };
}

// Only acknowledged files are appended. A retry starts at the first failed file.
export async function uploadBatch<T>(
  pending: T[],
  upload: (asset: T) => Promise<PrintFile[]>,
  onSuccess: (files: PrintFile[]) => void,
  onProgress: (completed: number, total: number) => void,
  current: () => boolean,
) {
  onProgress(0, pending.length);
  for (const [index, asset] of pending.entries()) {
    try {
      const files = await upload(asset);
      if (!current()) throw new StaleSessionError();
      onSuccess(files);
      onProgress(index + 1, pending.length);
    } catch (error) {
      if (!current() || error instanceof StaleSessionError)
        throw new StaleSessionError();
      return {
        remaining: pending.slice(index),
        completed: index,
        error:
          error instanceof Error
            ? error.message
            : "Upload failed. Please retry.",
      };
    }
  }
  return { remaining: [] as T[], completed: pending.length, error: "" };
}
