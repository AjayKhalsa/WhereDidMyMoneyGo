import type { LucideIcon } from "lucide-react";
import { ChartNoAxesColumn, House, Wallet } from "lucide-react";

/**
 * Four destinations, no more (spec §5).
 *
 * Home is where you understand your position, Insights is where you
 * understand your behaviour, Money is where you manage the structure, and
 * Add is an action rather than a place — it opens over whatever you were
 * doing and returns you there.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** What this screen is for, used as the accessible description. */
  purpose: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: House,
    purpose: "Your financial position right now",
  },
  {
    href: "/insights",
    label: "Insights",
    icon: ChartNoAxesColumn,
    purpose: "Patterns in how you spend",
  },
  {
    href: "/money",
    label: "Money",
    icon: Wallet,
    purpose: "Accounts, income, investments and goals",
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
