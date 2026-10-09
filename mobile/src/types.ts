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
};
export type Order = {
  _id: string;
  shop: Shop;
  files: (PrintFile & { upload: string })[];
  settings: Settings;
  notes: string;
  amount: number;
  pages: number;
  status: "Queued" | "Printing" | "Ready for pickup" | "Collected";
  pickupCode: string;
  createdAt: string;
  readyAt?: string;
  pushState: string;
};
