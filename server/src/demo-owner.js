import { User, Shop } from "./models.js";
import { passwordHash } from "./accounts.js";

// Imported only by the isolated local demo, never by the hosted API.
export const demoOwner = {
  email: "owner@paprint.test",
  password: "PaPrintDemo123!",
};
export async function seedDemoOwner() {
  await User.init();
  const user = await User.findOneAndUpdate(
    { email: demoOwner.email },
    {
      $setOnInsert: {
        name: "Demo Shop Owner",
        accountType: "owner",
        passwordHash: await passwordHash(demoOwner.password),
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  // Preserve existing shop ownership if someone has customized their demo.
  await Shop.updateOne(
    { _id: "70617072696e740000000001", owner: { $exists: false } },
    {
      $set: {
        owner: user._id,
        registrationStatus: "approved",
        hours: "8:00 AM – 6:00 PM",
        representative: user.name,
      },
    },
  );
}
