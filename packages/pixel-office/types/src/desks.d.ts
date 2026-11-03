import { type OfficeLayout } from "../upstream/webview-ui/src/office/types";
/** Seat ids that face a work desk, in a stable order (top-left first). */
export declare function workSeatIds(layout: OfficeLayout): string[];
/** Return a layout with at least `needed` work seats (the input is not modified). */
export declare function ensureWorkSeats(layout: OfficeLayout, needed: number): OfficeLayout;
