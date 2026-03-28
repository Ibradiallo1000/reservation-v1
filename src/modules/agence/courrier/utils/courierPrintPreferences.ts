const LS_MODE = "courier.lastPrintMode";
const LS_PAPER = "courier.printPaper";

export type CourierPrintMode = "all" | "ticket" | "label";
export type CourierPrintPaper = "thermal" | "a4";

function safeParseMode(v: string | null): CourierPrintMode {
  if (v === "all" || v === "ticket" || v === "label") return v;
  return "all";
}

function safeParsePaper(v: string | null): CourierPrintPaper {
  if (v === "thermal" || v === "a4") return v;
  return "a4";
}

export function readCourierPrintMode(): CourierPrintMode {
  try {
    return safeParseMode(localStorage.getItem(LS_MODE));
  } catch {
    return "all";
  }
}

export function writeCourierPrintMode(mode: CourierPrintMode): void {
  try {
    localStorage.setItem(LS_MODE, mode);
  } catch {
    /* ignore */
  }
}

export function readCourierPrintPaper(): CourierPrintPaper {
  try {
    return safeParsePaper(localStorage.getItem(LS_PAPER));
  } catch {
    return "a4";
  }
}

export function writeCourierPrintPaper(paper: CourierPrintPaper): void {
  try {
    localStorage.setItem(LS_PAPER, paper);
  } catch {
    /* ignore */
  }
}
