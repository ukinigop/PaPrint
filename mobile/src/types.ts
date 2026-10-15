export type Account = {
  id: string;
  name: string;
  email: string;
  phone: string;
  accountType: "customer" | "owner";
  savedShops: string[];
  defaultPaper: "A4" | "Letter" | "Legal";
  reducedMotion: boolean;
};
export type Shop = {
  _id: string;
  name: string;
  address: string;
  distance: string;
  estimate: string;
  rating: number;
  open: boolean;
  accent: string;
  monoRate: number;
  colorRate: number;
  contact?: string;
  hours?: string;
  registrationStatus?: "draft" | "submitted" | "approved";
  representative?: string;
  email?: string;
  documents?: { _id: string; name: string; size: number }[];
};
export type PrintFile = {
  _id: string;
  name: string;
  pages: number;
  size: number;
};
export type Settings = {
  paper: "A4" | "Letter" | "Legal";
  color: "Black & white" | "Color";
  sides: "Single-sided" | "Double-sided";
  copies: number;
  pageRange?: string;
  finishing?: "No binding";
};
export type Order = {
  _id: string;
  shop: Shop;
  files: (PrintFile & { upload: string })[];
  settings: Settings;
  notes: string;
  amount: number;
  paymentMethod?: "pickup" | "gcash";
  paymentStatus?: "paid" | "unpaid";
  pages: number;
  status: "Queued" | "Printing" | "Ready for pickup" | "Collected";
  pickupCode: string;
  createdAt: string;
  readyAt?: string;
  pushState: string;
};
