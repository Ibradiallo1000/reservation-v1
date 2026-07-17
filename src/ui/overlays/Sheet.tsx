import React from "react";
import { Dialog } from "./Dialog";
export type SheetProps = React.ComponentProps<typeof Dialog>;
/** Accessible mobile presentation; focus, Escape and restoration are owned by Headless UI. */
export function Sheet(props: SheetProps) { return <Dialog {...props} />; }
