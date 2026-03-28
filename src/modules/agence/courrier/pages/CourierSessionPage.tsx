/**
 * Hub courrier (comptoir ouvert) : actions principales — état session dans le header (context).
 */

import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCourierWorkspace } from "../context/CourierWorkspaceContext";
import { Package, Inbox, Truck } from "lucide-react";

export default function CourierSessionPage() {
  const { primaryColor, secondaryColor, session } = useCourierWorkspace();

  const active = session?.status === "ACTIVE";
  const gradient = `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`;

  const baseBtn =
    "flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl px-6 text-base font-bold shadow-md transition hover:opacity-95 active:scale-[0.99] sm:min-h-[64px]";

  const disabledCls = "pointer-events-none opacity-45 grayscale-[0.3]";

  const cardPrimary = useMemo(
    () => `${baseBtn} text-white ${!active ? disabledCls : ""}`,
    [active]
  );

  const cardOutline = `${baseBtn} border-2 border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100`;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10 lg:max-w-2xl lg:px-6">
      <div className="grid gap-4">
        <Link
          to="/agence/courrier/nouveau"
          className={`${cardPrimary} ${!active ? "!bg-gray-400 dark:!bg-gray-600" : ""}`}
          style={active ? { background: gradient } : undefined}
          aria-disabled={!active}
          onClick={(e) => {
            if (!active) e.preventDefault();
          }}
        >
          <Package className="h-7 w-7 shrink-0" />
          Envoi
        </Link>
        <Link
          to="/agence/courrier/arrivages"
          className={`${cardOutline} ${!active ? disabledCls : ""}`}
          aria-disabled={!active}
          onClick={(e) => {
            if (!active) e.preventDefault();
          }}
        >
          <Inbox className="h-7 w-7 shrink-0" style={{ color: primaryColor }} />
          Arrivages
        </Link>
        <Link
          to="/agence/courrier/remise"
          className={`${cardOutline} ${!active ? disabledCls : ""}`}
          aria-disabled={!active}
          onClick={(e) => {
            if (!active) e.preventDefault();
          }}
        >
          <Truck className="h-7 w-7 shrink-0" style={{ color: primaryColor }} />
          Remise
        </Link>
      </div>
    </div>
  );
}
