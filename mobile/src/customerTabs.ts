export const customerTabs = ["Print", "Shops", "Orders", "Profile"] as const;
export type CustomerTab = (typeof customerTabs)[number];
export const customerTabRoutes = {
  Print: "/home",
  Shops: "/shops",
  Orders: "/orders",
  Profile: "/profile",
} as const;
const pathTabs: Readonly<Record<string, CustomerTab>> = {
  "/home": "Print",
  "/shops": "Shops",
  "/shop": "Shops",
  "/orders": "Orders",
  "/order": "Orders",
  "/profile": "Profile",
};
export function tabForPath(path: string): CustomerTab | null {
  return pathTabs[path.replace(/\/+$/, "") || "/"] || null;
}
