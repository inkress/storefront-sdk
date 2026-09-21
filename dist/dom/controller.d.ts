import type { StorefrontLike } from './sdk-like';
export interface ResolvedControllerOptions {
    /** Node the view is queried from (usually `document`). */
    root: Document | HTMLElement;
    /** Owning document, for body class + focus. */
    doc: Document;
    currency: string;
    locale: string;
    /** Open the cart drawer after a plain add. Default: true. */
    autoOpenDrawerOnAdd: boolean;
    /** Follow the payment redirect after checkout. Default: true. */
    checkoutRedirect: boolean;
    /** Where `buy-now` sends the shopper. Default: `/checkout`. */
    checkoutPath: string;
    /** Navigation seam (overridable for tests). */
    navigate: (url: string) => void;
}
export interface CartController {
    paint(): void;
    open(): void;
    close(): void;
    unmount(): void;
}
export declare function mountCartController(sdk: StorefrontLike, opts: ResolvedControllerOptions): CartController;
//# sourceMappingURL=controller.d.ts.map