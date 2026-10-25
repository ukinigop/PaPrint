export type Account = {
  id: string;
  name: string;
  email: string;
  phone: string;
  accountType: "customer" | "owner" | "admin";
  savedShops: string[];
  defaultPaper: "A4" | "Letter" | "Legal";
  reducedMotion: boolean;
};
export type Shop = {
  _id: string;
  __v?: number;
  name: string;
  address: string;
  coordinates?: { latitude: number; longitude: number } | null;
  savedCount?: number;
  queue?: {
    preparing: number;
    printing: number;
    ready: number;
    ongoing: number;
  };
  locationAddress?: string;
  locationRequest?: {
    requestId: string;
    address: string;
    coordinates: { latitude: number; longitude: number };
    status: "pending" | "approved" | "rejected";
    requestedAt: string;
    reviewedAt?: string;
    reason?: string;
  };
  distance: string;
  estimate: string;
  rating: number;
  open: boolean;
  accent: string;
  monoRate: number;
  colorRate: number;
  contact?: string;
  hours?: string;
  registrationStatus?: "draft" | "submitted" | "approved" | "rejected";
  submissionVersion?: number;
  rejectionReason?: string;
  reviews?: {
    reviewer: string;
    decision: string;
    reason: string;
    at: string;
    submissionVersion: number;
  }[];
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
  status:
    | "Queued"
    | "Printing"
    | "Ready for pickup"
    | "Collected"
    | "Cancelled"
    | "Rejected";
  outcome?: {
    actorId: string;
    actorRole: "customer" | "owner" | "shop";
    at: string;
    reason: string;
  };
  pickupCode: string;
  createdAt: string;
  readyAt?: string;
  pushState: string;
};
