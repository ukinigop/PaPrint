import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ownerSnapshot,
  ownerDirty,
  reconcileOwnerForm,
  prepareRegistrationStep,
  registrationSteps,
  latestWorkspace,
} from "../src/ownerForm.ts";
const user = {
  name: "Owner",
  phone: "09123456789",
  email: "owner@example.test",
};
const shop = {
  _id: "shop",
  __v: 0,
  name: "Sample Prints",
  representative: "Owner",
  address: "Sample Street, Naga",
  email: user.email,
  contact: user.phone,
  hours: "8 AM–6 PM",
  monoRate: 2,
  colorRate: 8,
  open: false,
};

test("clean forms receive newer operating settings; older polls cannot roll them back", () => {
  const initial = ownerSnapshot(shop, user);
  const remote = ownerSnapshot(
    { ...shop, __v: 1, monoRate: 3, open: true },
    user,
  );
  const synced = reconcileOwnerForm(initial, remote);
  assert.equal(synced.values.mono, "3");
  assert.equal(synced.values.open, true);
  assert.equal(ownerDirty(synced), false);
  assert.equal(reconcileOwnerForm(synced, initial), synced);
  const newerShop = { ...shop, __v: 1, monoRate: 3 };
  assert.equal(latestWorkspace(newerShop, shop), newerShop);
  assert.equal(latestWorkspace(newerShop, null), null);
});
test("remote edits preserve dirty fields and block saving until explicit reload", () => {
  const initial = ownerSnapshot(shop, user);
  const edited = {
    ...initial,
    values: { ...initial.values, hours: "9 AM–5 PM" },
  };
  const remote = ownerSnapshot({ ...shop, __v: 1, monoRate: 4 }, user);
  const conflict = reconcileOwnerForm(edited, remote);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.values.hours, "9 AM–5 PM");
  assert.equal(conflict.version, 0);
  assert.equal(ownerDirty(conflict), true);
  const reloaded = ownerSnapshot({ ...shop, __v: 1, monoRate: 4 }, user);
  assert.equal(reloaded.conflict, false);
  assert.equal(reloaded.values.mono, "4");
});
test("document-only version changes preserve local business edits", () => {
  const initial = ownerSnapshot(shop, user);
  const edited = {
    ...initial,
    values: { ...initial.values, name: "New legal name" },
  };
  const next = reconcileOwnerForm(
    edited,
    ownerSnapshot({ ...shop, __v: 1 }, user),
  );
  assert.equal(next.version, 1);
  assert.equal(next.conflict, false);
  assert.equal(next.values.name, "New legal name");
});
test("registration forward steps save edits and review requires three documents", async () => {
  let saves = 0;
  const save = async () => {
    saves++;
    return { ...shop, documents: [{}, {}, {}] };
  };
  assert.equal(
    await prepareRegistrationStep(registrationSteps[1], save),
    registrationSteps[1],
  );
  assert.equal(
    await prepareRegistrationStep(registrationSteps[2], save),
    registrationSteps[2],
  );
  assert.equal(saves, 2);
  await prepareRegistrationStep(registrationSteps[0], save);
  assert.equal(saves, 2);
  await assert.rejects(
    prepareRegistrationStep(registrationSteps[2], async () => ({
      ...shop,
      documents: [{}],
    })),
    { code: "MISSING_REGISTRATION_DOCUMENTS" },
  );
  await assert.rejects(
    prepareRegistrationStep(registrationSteps[1], async () => {
      throw new Error("Invalid business email");
    }),
    /Invalid business email/,
  );
});
