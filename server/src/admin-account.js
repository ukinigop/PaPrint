import { User, Shop, AccountSession } from "./models.js";
export async function promoteAdmin(email) {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user)
    throw new Error("Create a customer account with this email first.");
  if (user.accountType === "owner" || (await Shop.exists({ owner: user._id })))
    throw new Error(
      "Owner accounts cannot be promoted. Use a separate customer account.",
    );
  const updated = await User.findOneAndUpdate(
    { _id: user._id, accountType: user.accountType },
    { accountType: "admin" },
    { new: true },
  );
  if (!updated) throw new Error("Account changed. Try again.");
  await AccountSession.deleteMany({ user: user._id });
  return updated;
}
