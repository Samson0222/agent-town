import type { OfficeLayout } from "../upstream/webview-ui/src/office/types";
export interface LoadedOffice {
    layout: OfficeLayout | null;
    characterCount: number;
}
/** Load and install all office art once per page (idempotent). `base` is the URL folder that contains `assets/`. */
export declare function loadOfficeAssets(base?: string): Promise<LoadedOffice>;
