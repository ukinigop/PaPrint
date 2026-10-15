import { z } from "zod";
import { Shop, User } from "./models.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
export const safeRegistration = (shop) =>
  shop && {
    ...shop.toObject(),
    documents: shop.documents.map((d) => ({
      _id: d.id,
      name: d.name,
      size: d.size,
    })),
  };
export function installAdmin(app, { auth, fileStorage }) {
  const admin = async (req, res, next) => {
    if (
      !req.user.account ||
      (await User.findById(req.user.id))?.accountType !== "admin"
    )
      throw fail(403, "Administrator access required.");
    next();
  };
  app.use("/api/admin", auth, admin);
  const registration = async (req, res, next) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw fail(400, "Invalid shop.");
    req.shop = await Shop.findById(req.params.id);
    if (!req.shop) throw fail(404, "Shop not found.");
    next();
  };
  app.get("/api/admin/shops", async (req, res) => {
    const status = z
      .enum(["submitted", "approved", "rejected"])
      .safeParse(req.query.status || "submitted");
    if (!status.success) throw fail(400, "Invalid registration status.");
    res.json(
      (
        await Shop.find({ registrationStatus: status.data }).sort({ _id: -1 })
      ).map(safeRegistration),
    );
  });
  app.get("/api/admin/shops/:id", registration, (req, res) =>
    res.json(safeRegistration(req.shop)),
  );
  app.get(
    "/api/admin/shops/:id/documents/:documentId",
    registration,
    async (req, res) => {
      if (!/^[a-f\d]{24}$/i.test(req.params.documentId))
        throw fail(400, "Invalid document.");
      const document = req.shop.documents.id(req.params.documentId);
      if (!document) throw fail(404, "Document not found.");
      res
        .type("pdf")
        .set(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        )
        .send(await fileStorage.read(document.path));
    },
  );
  app.post("/api/admin/shops/:id/decision", registration, async (req, res) => {
    const parsed = z
      .object({
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(1000).default(""),
        submissionVersion: z.number().int().nonnegative(),
      })
      .strict()
      .safeParse(req.body);
    if (
      !parsed.success ||
      (parsed.data.decision === "rejected" && !parsed.data.reason)
    )
      throw fail(400, "Choose a decision and provide a reason for rejection.");
    const { decision, reason, submissionVersion } = parsed.data;
    // Missing version belongs to registrations submitted before this feature.
    const versionFilter =
      submissionVersion === 0
        ? {
            $or: [
              { submissionVersion: 0 },
              { submissionVersion: { $exists: false } },
            ],
          }
        : { submissionVersion };
    const updated = await Shop.findOneAndUpdate(
      { _id: req.shop.id, registrationStatus: "submitted", ...versionFilter },
      {
        $set: {
          registrationStatus: decision,
          open: false,
          rejectionReason: decision === "rejected" ? reason : "",
        },
        $inc: { __v: 1 },
        $push: {
          reviews: {
            reviewer: req.user.id,
            decision,
            reason,
            at: new Date(),
            submissionVersion,
          },
        },
      },
      { new: true },
    );
    if (!updated)
      throw fail(409, "Registration changed. Refresh before reviewing again.");
    res.json(safeRegistration(updated));
  });
}
