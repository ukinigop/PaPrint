import type { Account, Shop } from "./types";

export type OwnerValues = {
  name: string;
  representative: string;
  address: string;
  contact: string;
  email: string;
  hours: string;
  mono: string;
  color: string;
  open: boolean;
  latitude: string;
  longitude: string;
};
export type OwnerForm = {
  shopId: string;
  version: number;
  baseline: OwnerValues;
  values: OwnerValues;
  conflict: boolean;
};
export function ownerSnapshot(shop: Shop | null, user: Account): OwnerForm {
  const values = {
    name: shop?.name || "",
    representative: shop?.representative || user.name,
    address: shop?.address || "",
    contact: shop?.contact || user.phone || "",
    email: shop?.email || user.email,
    hours: shop?.hours || "8:00 AM – 6:00 PM",
    mono: String(shop?.monoRate ?? 2),
    color: String(shop?.colorRate ?? 8),
    open: shop?.open || false,
    latitude: String(shop?.coordinates?.latitude ?? ""),
    longitude: String(shop?.coordinates?.longitude ?? ""),
  };
  return {
    shopId: shop?._id || "",
    version: shop?.__v || 0,
    baseline: values,
    values,
    conflict: false,
  };
}
export const ownerDirty = (form: OwnerForm) =>
  JSON.stringify(form.values) !== JSON.stringify(form.baseline);
export function latestWorkspace(current: Shop | null, incoming: Shop | null) {
  if (
    current &&
    incoming &&
    current._id === incoming._id &&
    (incoming.__v || 0) < (current.__v || 0)
  )
    return current;
  return incoming;
}
export function reconcileOwnerForm(
  form: OwnerForm,
  remote: OwnerForm,
): OwnerForm {
  if (form.shopId !== remote.shopId) return remote;
  if (remote.version < form.version) return form;
  const same =
    JSON.stringify(remote.baseline) === JSON.stringify(form.baseline);
  if (same)
    return remote.version === form.version
      ? form
      : { ...form, version: remote.version };
  if (!ownerDirty(form)) return remote;
  // Keep local edits, but do not let them overwrite another session's changes.
  return form.conflict ? form : { ...form, conflict: true };
}
export const registrationSteps = [
  "01 Business details",
  "02 Documents",
  "03 Review & submit",
] as const;
export type RegistrationStep = (typeof registrationSteps)[number];
export async function prepareRegistrationStep(
  target: RegistrationStep,
  save: () => Promise<Shop>,
): Promise<RegistrationStep> {
  if (target === registrationSteps[0]) return target;
  const shop = await save();
  if (target === registrationSteps[2] && shop.documents?.length !== 3)
    throw Object.assign(
      new Error(
        "Upload your business permit, registration proof and owner identification as 3 PDFs before review.",
      ),
      { code: "MISSING_REGISTRATION_DOCUMENTS" },
    );
  return target;
}
