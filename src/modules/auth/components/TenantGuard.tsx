/**
 * TenantGuard — Security verification for multi-tenant dashboard access.
 * Ensures the authenticated user's companyId matches the resolved tenant (subdomain or URL).
 * Runs when loading company/agency dashboards; blocks access and redirects to login on mismatch.
 */

import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSlugFromHostname,
  resolveTenant,
  type TenantResolution,
} from "@/lib/tenantResolver";

interface TenantGuardProps {
  children: React.ReactNode;
}

const TENANT_MISMATCH_ERROR = "tenant_mismatch";

/**
 * Resolves the "expected" company ID for the current context:
 * - Path /compagnie/:companyId → use params.companyId
 * - Subdomain (e.g. mali-trans.teliya.app) → resolve tenant from hostname
 * - Otherwise no tenant context (e.g. /admin on main domain) → no check
 */
function useExpectedCompanyId(): {
  expectedCompanyId: string | null;
  loading: boolean;
  error: string | null;
} {
  const { companyId: paramCompanyId } = useParams<{ companyId?: string }>();
  const location = useLocation();
  const pathname = location.pathname;
  const isSubdomain = typeof window !== "undefined" && !!getSlugFromHostname();

  const [resolved, setResolved] = useState<TenantResolution | null>(null);
  const [loading, setLoading] = useState(isSubdomain);
  const [error, setError] = useState<string | null>(null);

  // Path-based tenant: /compagnie/:companyId
  const pathCompanyId =
    pathname.startsWith("/compagnie/") && paramCompanyId
      ? paramCompanyId.trim()
      : null;

  useEffect(() => {
    if (!isSubdomain) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    resolveTenant()
      .then((tenant) => {
        if (!cancelled) {
          setResolved(tenant ?? null);
          setError(tenant ? null : "tenant_not_found");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError("tenant_resolve_error");
          console.warn("[TenantGuard] resolveTenant failed", err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSubdomain]);

  const expectedCompanyId =
    pathCompanyId ?? (resolved?.companyId ?? null);

  return {
    expectedCompanyId: expectedCompanyId || null,
    loading: isSubdomain ? loading : false,
    error: isSubdomain ? error : null,
  };
}

/**
 * When on subdomain and path is /compagnie/:companyId, the URL company must match the subdomain tenant.
 */
function useSubdomainPathConsistency(
  pathCompanyId: string | null
): { consistent: boolean; resolved: TenantResolution | null } {
  const [resolved, setResolved] = useState<TenantResolution | null>(null);
  const slug = getSlugFromHostname();
  const isSubdomain = !!slug;

  useEffect(() => {
    if (!isSubdomain || !pathCompanyId) return;
    let cancelled = false;
    resolveTenant(slug).then((tenant) => {
      if (!cancelled) setResolved(tenant ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [isSubdomain, pathCompanyId, slug]);

  const consistent =
    !isSubdomain ||
    !pathCompanyId ||
    !resolved ||
    resolved.companyId === pathCompanyId;
  return { consistent, resolved };
}

export default function TenantGuard({ children }: TenantGuardProps) {
  const { user, loading: authLoading, companyId: userCompanyId, isPlatformAdmin } = useAuth();
  const location = useLocation();
  const { companyId: paramCompanyId } = useParams<{ companyId?: string }>();
  const pathname = location.pathname;
  const pathCompanyId =
    pathname.startsWith("/compagnie/") && paramCompanyId
      ? paramCompanyId.trim()
      : null;

  const {
    expectedCompanyId,
    loading: tenantLoading,
    error: tenantError,
  } = useExpectedCompanyId();

  const { consistent: subdomainConsistent } = useSubdomainPathConsistency(pathCompanyId);

  if (authLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-gray-600">
        Vérification de l&apos;authentification...
      </div>
    );
  }

  if (!user) {
    return <>{children}</>;
  }

  if (tenantLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-gray-600">
        Vérification du tenant...
      </div>
    );
  }

  if (tenantError && expectedCompanyId) {
    return (
      <Navigate
        to={`/login?error=${TENANT_MISMATCH_ERROR}`}
        replace
        state={{ from: location }}
      />
    );
  }

  if (!subdomainConsistent) {
    return (
      <Navigate
        to={`/login?error=${TENANT_MISMATCH_ERROR}`}
        replace
        state={{ from: location }}
      />
    );
  }

  if (!expectedCompanyId) {
    return <>{children}</>;
  }

  const userCompany = (userCompanyId ?? "").trim();
  const expected = expectedCompanyId.trim();

  if (!userCompany) {
    return (
      <Navigate
        to={`/login?error=${TENANT_MISMATCH_ERROR}`}
        replace
        state={{ from: location }}
      />
    );
  }

  if (userCompany !== expected && !isPlatformAdmin) {
    return (
      <Navigate
        to={`/login?error=${TENANT_MISMATCH_ERROR}`}
        replace
        state={{ from: location }}
      />
    );
  }

  return <>{children}</>;
}

export { TENANT_MISMATCH_ERROR };
