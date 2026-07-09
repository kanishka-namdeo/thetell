import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  BarChart3,
  Building2,
  ShieldCheck,
  Settings,
  Brain,
  Flag,
  Server,
  Globe,
  User,
  Bot,
  Workflow,
  Activity,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  href: string;
  children: NavItem[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
  groups?: NavGroup[];
}

// Main dashboard navigation items (visible to all authenticated users)
// Reduced from 7 to 4 items: Overview (with tabs), Signals, Companies, Strategic Insights
export const mainNavItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/signals", label: "Signals", icon: BarChart3 },
  { href: "/dashboard/companies", label: "Companies", icon: Building2 },
];

// User account items
// Settings merged into Profile page
export const userNavItems: NavItem[] = [
  { href: "/dashboard/profile", label: "Profile & Settings", icon: User },
];

// Admin navigation - 7 items with Control Center as primary ops page
// Control Center consolidates all manual pipeline triggers
export const adminNavItems: NavItem[] = [
  { href: "/dashboard/admin", label: "Overview", icon: ShieldCheck },
  { href: "/dashboard/admin/control-center", label: "Control Center", icon: Workflow },
  { href: "/dashboard/admin/content", label: "Content", icon: Flag },
  { href: "/dashboard/admin/intelligence", label: "Intelligence", icon: Brain },
  { href: "/dashboard/admin/operations", label: "System", icon: Server },
  { href: "/dashboard/admin/metrics", label: "Metrics", icon: Activity },
  { href: "/dashboard/admin/deepagent", label: "DeepAgent", icon: Bot },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
];

// Public navigation (for mobile nav in public pages)
export const publicNavItems: NavItem[] = [
  { href: "/", label: "Feed", icon: Globe },
];

// Check if a nav item is active
export function isNavItemActive(href: string, pathname: string): boolean {
  // Exact match for root paths
  if (href === "/" || href === "/dashboard" || href === "/dashboard/admin") {
    return pathname === href;
  }
  // Prefix match for other paths
  return pathname === href || pathname.startsWith(href + "/");
}

// Check if a nav group is active
export function isNavGroupActive(group: NavGroup, pathname: string): boolean {
  return pathname === group.href || pathname.startsWith(group.href + "/");
}
