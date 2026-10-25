import { z } from "zod";
import { Shop, User } from "./models.js";
import { coordinatesSchema } from "./shop-location.js";
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
  app.get("/api/admin/location-requests", async (req, res) => {
    res.json(
      (
        await Shop.find({ "locationRequest.status": "pending" }).sort({
          "locationRequest.requestedAt": 1,
        })
      ).map(safeRegistration),
    );
  });
  app.post(
    "/api/admin/shops/:id/location-decision",
    registration,
    async (req, res) => {
      const parsed = z
        .object({
          requestId: z.string().uuid(),
          decision: z.enum(["approved", "rejected"]),
          reason: z.string().trim().max(500).default(""),
        })
        .strict()
        .safeParse(req.body);
      if (
        !parsed.success ||
        (parsed.data.decision === "rejected" && !parsed.data.reason)
      )
        throw fail(400, "Provide a reason when rejecting a location change.");
      const { requestId, decision, reason } = parsed.data;
      const pending = req.shop.locationRequest;
      if (
        !pending ||
        pending.requestId !== requestId ||
        pending.status !== "pending"
      )
        throw fail(
          409,
          "Location request changed. Refresh before reviewing again.",
        );
      const reviewedAt = new Date();
      const updated = await Shop.findOneAndUpdate(
        {
          _id: req.shop.id,
          registrationStatus: "approved",
          "locationRequest.requestId": requestId,
          "locationRequest.status": "pending",
        },
        {
          $set: {
            "locationRequest.status": decision,
            "locationRequest.reason": reason,
            "locationRequest.reviewedBy": req.user.id,
            "locationRequest.reviewedAt": reviewedAt,
            ...(decision === "approved"
              ? {
                  coordinates: pending.coordinates,
                  locationAddress: pending.address,
                }
              : {}),
          },
          $inc: { __v: 1 },
          $push: {
            locationReviews: {
              ...pending.toObject(),
              status: decision,
              reason,
              reviewedBy: req.user.id,
              reviewedAt,
              previousAddress: req.shop.locationAddress || req.shop.address,
              previousCoordinates: req.shop.coordinates,
            },
          },
        },
        { new: true },
      );
      if (!updated)
        throw fail(
          409,
          "Location request changed. Refresh before reviewing again.",
        );
      res.json(safeRegistration(updated));
    },
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
    if (
      decision === "approved" &&
      !coordinatesSchema.safeParse(
        req.shop.coordinates?.toObject?.() || req.shop.coordinates,
      ).success
    )
      throw fail(
        400,
        "A storefront map pin is required before approving registration.",
      );
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
