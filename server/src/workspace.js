import multer from "multer";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { Shop, User, Order, Upload } from "./models.js";
import {
  advanceOrder,
  confirmPayment,
  endOrder,
  publicShop,
} from "./fulfillment.js";
import { safeRegistration } from "./admin.js";
const fail = (status, message) => Object.assign(new Error(message), { status });

const schema = z
  .object({
    name: z.string().trim().min(2).max(100),
    representative: z.string().trim().min(2).max(80),
    address: z.string().trim().min(5).max(250),
    contact: z.string().trim().min(7).max(20),
    email: z.string().trim().email().max(254),
    hours: z.string().trim().min(3).max(80),
    monoRate: z.number().positive().max(1000),
    colorRate: z.number().positive().max(1000),
  })
  .strict();
export function installWorkspace(
  app,
  { auth, fileStorage, maxUploadBytes, notifyPickup },
) {
  const owner = async (req, res, next) => {
    if (
      !req.user.account ||
      (await User.findById(req.user.id))?.accountType !== "owner"
    )
      throw fail(403, "A shop owner account is required.");
    req.shop = await Shop.findOne({ owner: req.user.id });
    next();
  };
  const registered = (req, res, next) => {
    if (!req.shop) throw fail(404, "Register your business first.");
    next();
  };
  const approved = (req, res, next) => {
    if (req.shop.registrationStatus !== "approved")
      throw fail(403, "Your shop must be approved before accepting orders.");
    next();
  };
  const safe = safeRegistration;
  app.get("/api/workspace", auth, owner, (req, res) =>
    res.json(safe(req.shop)),
  );
  app.put("/api/workspace", auth, owner, async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      throw fail(400, "Fill in the business details and valid printing rates.");
    if (
      req.shop &&
      !["draft", "rejected"].includes(req.shop.registrationStatus)
    )
      throw fail(
        409,
        "Submitted registrations cannot be edited while under review.",
      );
    if (req.shop) {
      Object.assign(req.shop, parsed.data);
      await req.shop.save();
    } else
      req.shop = await Shop.create({
        ...parsed.data,
        owner: req.user.id,
        registrationStatus: "draft",
        open: false,
        rating: 0,
        distance: "Naga City",
        estimate: "Ask shop",
        accent: "#276A68",
      });
    res.json(safe(req.shop));
  });
  app.patch(
    "/api/workspace/operations",
    auth,
    owner,
    registered,
    approved,
    async (req, res) => {
      const parsed = schema
        .pick({ hours: true, contact: true, monoRate: true, colorRate: true })
        .extend({
          open: z.boolean(),
          expectedVersion: z.number().int().nonnegative().optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success)
        throw fail(400, "Enter valid operating hours, contact and rates.");
      const { expectedVersion, ...settings } = parsed.data;
      const updated = await Shop.findOneAndUpdate(
        {
          _id: req.shop.id,
          owner: req.user.id,
          registrationStatus: "approved",
          ...(expectedVersion === undefined
            ? {}
            : expectedVersion === 0
              ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
              : { __v: expectedVersion }),
        },
        { $set: settings, $inc: { __v: 1 } },
        { new: true, runValidators: true },
      );
      if (!updated)
        throw fail(
          409,
          "Operating settings changed in another session. Reload the latest settings before saving.",
        );
      res.json(safe(updated));
    },
  );
  app.delete(
    "/api/workspace/documents/:documentId",
    auth,
    owner,
    registered,
    async (req, res) => {
      if (!["draft", "rejected"].includes(req.shop.registrationStatus))
        throw fail(409, "Registration documents are locked.");
      if (!/^[a-f\d]{24}$/i.test(req.params.documentId))
        throw fail(400, "Invalid document.");
      const document = req.shop.documents.id(req.params.documentId);
      if (!document) throw fail(404, "Document not found.");
      const location = document.path;
      document.deleteOne();
      await req.shop.save();
      await fileStorage.remove(location);
      res.json(safe(req.shop));
    },
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 3 },
  });
  app.post(
    "/api/workspace/documents",
    auth,
    owner,
    registered,
    upload.array("files", 3),
    async (req, res) => {
      if (!["draft", "rejected"].includes(req.shop.registrationStatus))
        throw fail(409, "Registration is already submitted.");
      if (
        !req.files?.length ||
        req.shop.documents.length + req.files.length > 3
      )
        throw fail(400, "Upload up to 3 registration PDFs.");
      if (req.files.reduce((sum, file) => sum + file.size, 0) > maxUploadBytes)
        throw fail(400, "Upload registration documents one at a time.");
      for (const f of req.files) {
        try {
          if (!f.originalname.toLowerCase().endsWith(".pdf")) throw new Error();
          await PDFDocument.load(f.buffer);
        } catch {
          throw fail(400, "Use valid, unlocked PDF documents.");
        }
      }
      const paths = [];
      try {
        for (const f of req.files) {
          const location = await fileStorage.put(f.buffer);
          paths.push(location);
          req.shop.documents.push({
            name: f.originalname.slice(0, 180),
            path: location,
            size: f.size,
          });
        }
        await req.shop.save();
      } catch (error) {
        await Promise.all(
          paths.map((p) => fileStorage.remove(p).catch(() => {})),
        );
        throw error;
      }
      res.status(201).json(safe(req.shop));
    },
  );
  app.post(
    "/api/workspace/submit",
    auth,
    owner,
    registered,
    async (req, res) => {
      if (!["draft", "rejected"].includes(req.shop.registrationStatus))
        throw fail(409, "Registration is already submitted.");
      const parsed = z
        .object({
          confirm: z.literal(true),
          expectedVersion: z.number().int().nonnegative().optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success || req.shop.documents.length < 3)
        throw fail(
          400,
          "Add your permit, registration proof, and identification PDFs, then confirm the details.",
        );
      if (
        parsed.data.expectedVersion !== undefined &&
        parsed.data.expectedVersion !== (req.shop.__v || 0)
      )
        throw fail(
          409,
          "Registration changed. Refresh and review the latest details before submitting.",
        );
      req.shop.registrationStatus = "submitted";
      req.shop.submissionVersion = (req.shop.submissionVersion || 0) + 1;
      req.shop.rejectionReason = "";
      await req.shop.save();
      res.json(safe(req.shop));
    },
  );
  app.get("/api/workspace/orders", auth, owner, registered, async (req, res) =>
    res.json(
      await Order.find({ shop: req.shop.id })
        .sort({ createdAt: -1 })
        .populate(publicShop),
    ),
  );
  app.patch(
    "/api/workspace/orders/:id/status",
    auth,
    owner,
    registered,
    approved,
    async (req, res) => {
      res.json(
        await advanceOrder(
          req.shop.id,
          req.params.id,
          req.body.status,
          notifyPickup,
        ),
      );
    },
  );
  app.post(
    "/api/workspace/orders/:id/payment",
    auth,
    owner,
    registered,
    approved,
    async (req, res) => {
      res.json(await confirmPayment(req.shop.id, req.params.id));
    },
  );
  app.post(
    "/api/workspace/orders/:id/reject",
    auth,
    owner,
    registered,
    approved,
    async (req, res) => {
      res.json(
        await endOrder({
          id: req.params.id,
          scope: { shop: req.shop.id },
          status: "Rejected",
          actorId: req.user.id,
          actorRole: "owner",
          body: req.body,
        }),
      );
    },
  );
  app.get(
    "/api/workspace/orders/:id/files/:fileId",
    auth,
    owner,
    registered,
    approved,
    async (req, res) => {
      if (
        ![req.params.id, req.params.fileId].every((id) =>
          /^[a-f\d]{24}$/i.test(id),
        )
      )
        throw fail(400, "Invalid identifier.");
      const order = await Order.findOne({
        _id: req.params.id,
        shop: req.shop.id,
      });
      if (
        !order ||
        !order.files.some((f) => String(f.upload) === req.params.fileId)
      )
        throw fail(404, "File not found.");
      const file = await Upload.findById(req.params.fileId);
      if (!file) throw fail(404, "File not found.");
      res
        .type("pdf")
        .set(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        )
        .send(await fileStorage.read(file.path));
    },
  );
}
