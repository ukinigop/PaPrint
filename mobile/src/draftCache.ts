import { emptyDraft, type Draft } from "./customerFlow";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const key = (accountId: string, base: string) =>
  "paprint.checkout." + JSON.stringify([base, accountId]);

// Tab-scoped metadata only: no local file contents or credentials are cached.
export function draftCache(storage: Storage | undefined) {
  return {
    read(accountId: string, base: string): Draft {
      try {
        const draft = JSON.parse(
          storage?.getItem(key(accountId, base)) || "null",
        );
        if (
          !draft?.shop ||
          typeof draft.shop._id !== "string" ||
          typeof draft.shop.name !== "string" ||
          typeof draft.requestKey !== "string" ||
          !draft.requestKey ||
          typeof draft.notes !== "string" ||
          !Array.isArray(draft.files) ||
          draft.files.length > 5 ||
          !draft.files.every(
            (file: Record<string, unknown>) =>
              file &&
              typeof file._id === "string" &&
              typeof file.name === "string" &&
              Number.isInteger(file.pages) &&
              Number(file.pages) > 0 &&
              typeof file.size === "number" &&
              file.size >= 0,
          ) ||
          !["A4", "Letter", "Legal"].includes(draft.settings?.paper) ||
          !["Black & white", "Color"].includes(draft.settings?.color) ||
          !["Single-sided", "Double-sided"].includes(draft.settings?.sides) ||
          !Number.isInteger(draft.settings?.copies) ||
          draft.settings.copies < 1 ||
          (draft.settings.pageRange !== undefined &&
            typeof draft.settings.pageRange !== "string")
        )
          return emptyDraft();
        return draft;
      } catch {
        return emptyDraft();
      }
    },
    write(accountId: string, base: string, draft: Draft) {
      try {
        if (draft.shop && draft.requestKey)
          storage?.setItem(key(accountId, base), JSON.stringify(draft));
        else storage?.removeItem(key(accountId, base));
      } catch {
        /* Storage can be unavailable; the in-memory checkout still works. */
      }
    },
    clear(accountId: string, base: string) {
      try {
        storage?.removeItem(key(accountId, base));
      } catch {
        /* See above. */
      }
    },
  };
}

export const tabDraftCache = draftCache(
  (() => {
    try {
      return typeof window !== "undefined" ? window.sessionStorage : undefined;
    } catch {
      return undefined;
    }
  })(),
);
