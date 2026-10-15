import multer from "multer";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { Shop, User, Order, Upload } from "./models.js";
import { nextStatus } from "./domain.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const publicShop = { path: "shop", select: "-documents -email -owner" };
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
  const safe = (shop) =>
    shop && {
      ...shop.toObject(),
      documents: shop.documents.map((d) => ({
        _id: d.id,
        name: d.name,
        size: d.size,
      })),
    };
  app.get("/api/workspace", auth, owner, (req, res) =>
    res.json(safe(req.shop)),
  );
  app.put("/api/workspace", auth, owner, async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      throw fail(400, "Fill in the business details and valid printing rates.");
    if (req.shop && req.shop.registrationStatus !== "draft")
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
      if (req.shop.registrationStatus !== "draft")
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
      if (req.shop.registrationStatus !== "draft")
        throw fail(409, "Registration is already submitted.");
      if (!req.body.confirm || req.shop.documents.length < 3)
        throw fail(
          400,
          "Add your permit, registration proof, and identification PDFs, then confirm the details.",
        );
      req.shop.registrationStatus = "submitted";
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
      if (!/^[a-f\d]{24}$/i.test(req.params.id))
        throw fail(400, "Invalid order.");
      const order = await Order.findOne({
        _id: req.params.id,
        shop: req.shop.id,
      });
      if (!order) throw fail(404, "Order not found.");
      if (nextStatus[order.status] !== req.body.status)
        throw fail(409, "Refresh the order before changing its status.");
      if (req.body.status === "Collected" && order.paymentStatus !== "paid")
        throw fail(409, "Confirm pickup payment before marking collected.");
      const change = { status: req.body.status };
      if (req.body.status === "Ready for pickup")
        Object.assign(change, { readyAt: new Date(), pushState: "pending" });
      const updated = await Order.findOneAndUpdate(
        { _id: order.id, status: order.status },
        change,
        { new: true },
      ).populate(publicShop);
      if (!updated) throw fail(409, "Order changed. Refresh and try again.");
      if (updated.pushState === "pending") await notifyPickup(updated);
      res.json(updated);
    },
  );
  app.post(
    "/api/workspace/orders/:id/payment",
    auth,
    owner,
    registered,
    approved,
    async (req, res) => {
      if (!/^[a-f\d]{24}$/i.test(req.params.id))
        throw fail(400, "Invalid order.");
      const updated = await Order.findOneAndUpdate(
        {
          _id: req.params.id,
          shop: req.shop.id,
          status: "Ready for pickup",
          paymentMethod: "pickup",
        },
        { paymentStatus: "paid" },
        { new: true },
      ).populate(publicShop);
      if (!updated)
        throw fail(409, "Confirm payment when this order is ready for pickup.");
      res.json(updated);
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
