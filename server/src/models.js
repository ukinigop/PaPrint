import mongoose from "mongoose";
const { Schema, model } = mongoose;
export const Shop = model(
  "Shop",
  new Schema({
    name: String,
    address: String,
    distance: String,
    estimate: String,
    rating: Number,
    open: Boolean,
    accent: String,
    monoRate: Number,
    colorRate: Number,
  }),
);
export const Upload = model(
  "Upload",
  new Schema({
    owner: { type: String, required: true },
    name: String,
    path: String,
    size: Number,
    pages: Number,
    createdAt: { type: Date, default: Date.now },
  }),
);
const settings = new Schema(
  { paper: String, color: String, sides: String, copies: Number },
  { _id: false },
);
export const Order = model(
  "Order",
  new Schema({
    customer: { type: String, required: true },
    shop: { type: Schema.Types.ObjectId, ref: "Shop" },
    files: [
      {
        upload: Schema.Types.ObjectId,
        name: String,
        pages: Number,
        size: Number,
      },
    ],
    settings,
    notes: String,
    amount: Number,
    pages: Number,
    status: {
      type: String,
      enum: ["Queued", "Printing", "Ready for pickup", "Collected"],
      default: "Queued",
    },
    requestKey: String,
    pickupCode: String,
    readyAt: Date,
    pushState: { type: String, default: "none" },
    createdAt: { type: Date, default: Date.now },
  }),
);
Order.schema.index({ customer: 1, requestKey: 1 }, { unique: true });
export const Device = model(
  "Device",
  new Schema({
    customer: { type: String, unique: true },
    pushToken: String,
  }),
);
export async function seedShops() {
  if (await Shop.countDocuments()) return;
  const shops = [
    {
      name: "ParaPrint Naga",
      address: "Ateneo Avenue, Naga City",
      distance: "0.5 km",
      estimate: "5–10 min",
      rating: 4.9,
      open: true,
      accent: "#4668F5",
      monoRate: 3,
      colorRate: 10,
    },
    {
      name: "QuickPrint",
      address: "Bagumbayan, Naga City",
      distance: "1.2 km",
      estimate: "10–15 min",
      rating: 4.7,
      open: true,
      accent: "#168C79",
      monoRate: 2.5,
      colorRate: 12,
    },
    {
      name: "Campus Copy Corner",
      address: "Peñafrancia Avenue, Naga City",
      distance: "2 km",
      estimate: "15–20 min",
      rating: 4.6,
      open: false,
      accent: "#D58C36",
      monoRate: 3,
      colorRate: 11,
    },
  ];
  await Shop.bulkWrite(shops.map((shop, index) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(`70617072696e74000000000${index + 1}`) },
      update: { $setOnInsert: shop },
      upsert: true,
    },
  })));
}
