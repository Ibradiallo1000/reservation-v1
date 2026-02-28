// src/shared/layout/InternalLayout.tsx
// Unified layout for ALL internal back-office spaces.
// Automatically switches between sidebar (>4 items) and horizontal tabs (<=4).
import React, { useState, useEffect } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom";
import { LogOut, Menu, X, User, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DESIGN } from "@/app/design-system";

/* ================================================================
   PUBLIC TYPES
   ================================================================ */
export interface NavSectionChild {
  label: string;
  path: string;
  /** If true, match exact path only (e.g. index route) */
  end?: boolean;
}

export interface NavSection {
  label: string;
  icon: LucideIcon;
  path: string;
  /** Badge count (e.g. pending reservations) */
  badge?: number;
  /** If true, match exact path only */
  end?: boolean;
  /** Optional children for collapsible ERP-style submenu */
  children?: NavSectionChild[];
}

export interface InternalLayoutProps {
  /** Navigation items — determines sidebar vs tabs automatically */
  sections: NavSection[];
  /** Current user role label displayed in the profile area */
  role: string;
  /** Display name shown in profile */
  userName?: string;
  /** User email (fallback for display name) */
  userEmail?: string;
  /** Brand / company name shown at the top */
  brandName?: string;
  /** Logo URL */
  logoUrl?: string;
  /** Primary color override (falls back to DESIGN.defaultTheme.primary) */
  primaryColor?: string;
  /** Secondary color override */
  secondaryColor?: string;
  /** Called when user clicks logout */
  onLogout: () => void;
  /** Optional banner component (e.g. impersonation banner) */
  banner?: React.ReactNode;
  /** Content rendered in the header's left area (e.g. breadcrumb, hierarchy) */
  headerLeft?: React.ReactNode;
  /** Content rendered in the header's right area before logout (e.g. notification bell) */
  headerRight?: React.ReactNode;
  /** Render Outlet (default) or children */
  children?: React.ReactNode;
  /** Optional class for main content area (e.g. agency-content-transition) */
  mainClassName?: string;
}

/* ================================================================
   ROLE LABELS (human-readable)
   ================================================================ */
const ROLE_LABELS: Record<string, string> = {
  admin_platforme: "Admin Plateforme",
  admin_compagnie: "CEO",
  chef_garage: "Chef garage",
  chefAgence: "Chef d'agence",
  superviseur: "Superviseur",
  guichetier: "Guichetier",
  company_accountant: "Chef Comptable",
  financial_director: "Directeur Financier",
  agency_accountant: "Comptable Agence",
};

/* ================================================================
   COMPONENT
   ================================================================ */
const InternalLayout: React.FC<InternalLayoutProps> = ({
  sections,
  role,
  userName,
  userEmail,
  brandName = "Teliya",
  logoUrl,
  primaryColor,
  secondaryColor,
  headerLeft,
  headerRight,
  onLogout,
  banner,
  children,
  mainClassName,
}) => {
  const primary = primaryColor || DESIGN.defaultTheme.primary;
  const secondary = secondaryColor || primary;
  const useSidebar = sections.length > 4;

  const displayName = userName || userEmail || "Utilisateur";
  const roleLabel = ROLE_LABELS[role] ?? role;
  const userInitial = displayName.charAt(0).toUpperCase();

  return useSidebar ? (
    <SidebarLayout
      sections={sections}
      role={roleLabel}
      displayName={displayName}
      userInitial={userInitial}
      brandName={brandName}
      logoUrl={logoUrl}
      primary={primary}
      secondary={secondary}
      headerLeft={headerLeft}
      headerRight={headerRight}
      onLogout={onLogout}
      banner={banner}
      mainClassName={mainClassName}
    >
      {children}
    </SidebarLayout>
  ) : (
    <TabsLayout
      sections={sections}
      role={roleLabel}
      displayName={displayName}
      userInitial={userInitial}
      brandName={brandName}
      logoUrl={logoUrl}
      primary={primary}
      secondary={secondary}
      headerLeft={headerLeft}
      headerRight={headerRight}
      onLogout={onLogout}
      banner={banner}
      mainClassName={mainClassName}
    >
      {children}
    </TabsLayout>
  );
};

/* ================================================================
   SHARED PROPS TYPE
   ================================================================ */
interface LayoutVariantProps {
  sections: NavSection[];
  role: string;
  displayName: string;
  userInitial: string;
  brandName: string;
  logoUrl?: string;
  primary: string;
  secondary: string;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  onLogout: () => void;
  banner?: React.ReactNode;
  children?: React.ReactNode;
  mainClassName?: string;
}

/* ================================================================
   SIDEBAR LAYOUT (>4 items)
   ================================================================ */
/** Returns true if pathname is the section path or any child path */
function isSectionOrChildActive(pathname: string, section: { path: string; children?: NavSectionChild[] }): boolean {
  if (pathname === section.path) return true;
  if (!section.children?.length) return false;
  return section.children.some((c) => {
    if (c.end) return pathname === c.path;
    return pathname === c.path || pathname.startsWith(c.path + "/");
  });
}

const SidebarLayout: React.FC<LayoutVariantProps> = ({
  sections,
  role,
  displayName,
  userInitial,
  brandName,
  logoUrl,
  primary,
  secondary,
  headerLeft,
  headerRight,
  onLogout,
  banner,
  children,
  mainClassName,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.forEach((s) => {
      if (s.children?.length && isSectionOrChildActive(pathname, s)) initial.add(s.path);
    });
    return initial;
  });

  useEffect(() => {
    sections.forEach((s) => {
      if (s.children?.length && isSectionOrChildActive(pathname, s)) {
        setExpandedKeys((prev) => (prev.has(s.path) ? prev : new Set(prev).add(s.path)));
      }
    });
  }, [pathname, sections]);

  const toggleExpanded = (path: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const sidebarContent = (
    <div className="flex-1 flex flex-col">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-white/15 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={brandName}
              className="w-9 h-9 rounded-full bg-white object-cover shrink-0 p-[2px]"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/20 grid place-items-center shrink-0">
              <User className="w-5 h-5" />
            </div>
          )}
          {!collapsed && (
            <span className="text-lg font-semibold tracking-wide truncate">
              {brandName}
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 hidden md:block"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-3 pb-24">
        {sections.map(({ label, icon: Icon, path, badge, end, children: childItems }) => {
          const hasChildren = childItems && childItems.length > 0;
          const isExpanded = expandedKeys.has(path);

          if (hasChildren) {
            return (
              <div key={path} className="my-1">
                <div className="flex items-center gap-1 rounded-xl overflow-hidden">
                  <NavLink
                    to={path}
                    end={end}
                    className={({ isActive: active }) =>
                      cn(
                        "group flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 min-w-0",
                        "whitespace-nowrap overflow-hidden",
                        active
                          ? "font-semibold text-white shadow-sm"
                          : "text-white/80 hover:text-white hover:bg-white/10",
                      )
                    }
                    style={({ isActive: active }) =>
                      active ? { backgroundColor: secondary, borderLeftWidth: "4px", borderLeftColor: "rgba(255,255,255,0.6)" } : { borderLeftWidth: "4px", borderLeftColor: "transparent" }
                    }
                    title={label}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="truncate flex-1 text-sm">{label}</span>}
                    {!collapsed && typeof badge === "number" && badge > 0 && (
                      <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </NavLink>
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); toggleExpanded(path); }}
                      className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? "Réduire" : "Développer"}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {!collapsed && (
                  <div
                    className="grid transition-[grid-template-rows] duration-200 ease-in-out"
                    style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
                    aria-hidden={!isExpanded}
                  >
                    <div className="overflow-hidden">
                      <div className="pl-4 pr-2 py-1 space-y-0.5 border-l-2 border-white/20 ml-3 mt-0.5">
                        {childItems!.map((ch) => (
                          <NavLink
                            key={ch.path}
                            to={ch.path}
                            end={ch.end}
                            className={({ isActive: active }) =>
                              cn(
                                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                                active
                                  ? "font-medium text-white bg-white/20"
                                  : "text-white/70 hover:text-white hover:bg-white/10",
                              )
                            }
                            onClick={() => setMobileOpen(false)}
                          >
                            {ch.label}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive: active }) =>
                cn(
                  "group flex items-center gap-3 my-1 rounded-xl px-3 py-2.5 transition-all duration-200",
                  "whitespace-nowrap overflow-hidden",
                  active
                    ? "font-semibold text-white shadow-sm"
                    : "text-white/80 hover:text-white hover:bg-white/10",
                )
              }
              style={({ isActive: active }) =>
                active ? { backgroundColor: secondary, borderLeftWidth: "4px", borderLeftColor: "rgba(255,255,255,0.6)" } : { borderLeftWidth: "4px", borderLeftColor: "transparent" }
              }
              title={label}
              onClick={() => setMobileOpen(false)}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="truncate flex-1 text-sm">{label}</span>}
              {!collapsed && typeof badge === "number" && badge > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Profile footer */}
      <div className="px-4 py-3 border-t border-white/15" style={{ backgroundColor: `${primary}DD` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-white/20 grid place-items-center shrink-0 text-sm font-bold">
              {userInitial}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{displayName}</p>
                <p className="text-[11px] text-white/80 leading-tight truncate">
                  {role}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={onLogout}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 grid place-items-center transition"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex h-full">
        {/* Sidebar — desktop */}
        <aside
          className={cn(
            "hidden md:flex fixed inset-y-0 left-0 flex-col text-white transition-all duration-300",
            DESIGN.zIndex.sidebar,
            collapsed ? DESIGN.layout.sidebarWidthCollapsed : DESIGN.layout.sidebarWidth,
          )}
          style={{ backgroundColor: primary }}
        >
          {sidebarContent}
        </aside>

        {/* Sidebar — mobile drawer */}
        <aside
          className={cn(
            "md:hidden fixed inset-y-0 left-0 w-64 flex flex-col text-white transition-transform duration-300",
            DESIGN.zIndex.sidebar,
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{ backgroundColor: primary }}
        >
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-4 right-4 p-1 rounded-lg bg-white/10 hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
          {sidebarContent}
        </aside>

        {/* Main content */}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0 transition-all duration-300",
            collapsed ? "md:ml-20" : "md:ml-64",
          )}
        >
          {/* Header */}
          <header
            className={cn(
              "sticky top-0 bg-white border-b shadow-sm flex items-center px-4 md:px-6 gap-4",
              DESIGN.zIndex.header,
              DESIGN.layout.headerHeight,
            )}
          >
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0">{headerLeft}</div>

            {/* Top-right */}
            <div className="flex items-center gap-2">
              {!headerLeft && (
                <div className="hidden sm:block text-right mr-1">
                  <p className="text-sm font-medium text-gray-900 leading-tight">
                    {displayName}
                  </p>
                  <p className="text-xs text-gray-500 leading-tight">{role}</p>
                </div>
              )}
              {headerRight}
              <button
                onClick={onLogout}
                className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
                title="Se déconnecter"
              >
                <LogOut className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </header>

          {/* Banner */}
          {banner}

          {/* Page content */}
          <main className={cn("flex-1 overflow-y-auto", DESIGN.pagePadding)}>
            <div className={cn(DESIGN.pageWidth, mainClassName)}>
              {children ?? <Outlet />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   TABS LAYOUT (<=4 items)
   ================================================================ */
const TabsLayout: React.FC<LayoutVariantProps> = ({
  sections,
  role,
  displayName,
  userInitial,
  brandName,
  logoUrl,
  primary,
  secondary,
  headerLeft,
  headerRight,
  onLogout,
  banner,
  children,
  mainClassName,
}) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className={cn(
          "sticky top-0 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70",
          DESIGN.zIndex.header,
        )}
      >
        <div className={cn(DESIGN.pageWidth, "px-4 md:px-6 py-3 flex items-center justify-between gap-4")}>
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={brandName}
                className="w-9 h-9 rounded-full object-cover border bg-white p-0.5 shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-100 grid place-items-center shrink-0">
                <User className="w-5 h-5 text-gray-500" />
              </div>
            )}
            <div className="min-w-0">
              <div
                className="font-bold tracking-tight truncate text-base"
                style={{ color: primary }}
              >
                {brandName}
              </div>
            </div>
          </div>

          {/* Profile — top right */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: primary }}
              >
                {userInitial}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-900 truncate">
                  {displayName}
                </div>
                <div className="text-xs text-gray-500 truncate">{role}</div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="border-t bg-white">
          <div className={cn(DESIGN.pageWidth, "px-4 md:px-6 py-2")}>
            <div className="flex flex-wrap gap-2 overflow-x-auto">
              {sections.map(({ label, icon: Icon, path, badge, end }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={end}
                  className={({ isActive: active }) =>
                    cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition",
                      active
                        ? "text-white shadow-sm"
                        : "text-gray-600 bg-white border hover:bg-gray-50",
                    )
                  }
                  style={({ isActive: active }) =>
                    active
                      ? { background: `linear-gradient(135deg, ${primary}, ${secondary})` }
                      : undefined
                  }
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {typeof badge === "number" && badge > 0 && (
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none ml-1">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Banner */}
      {banner}

      {/* Page content */}
      <main className={cn(DESIGN.pagePadding, "pb-8")}>
        <div className={cn(DESIGN.pageWidth, mainClassName)}>
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
};

export default InternalLayout;
