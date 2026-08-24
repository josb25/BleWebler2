/**
 * Scroll handling for in-app navigation.
 *
 * The app is one document: `.app` sets `min-height`, not `height`, so nothing
 * between it and the page content establishes a scrollport. Panels that declare
 * `height: 100%; overflow-y: auto` therefore grow with their content instead of
 * scrolling inside it, and the thing that actually moves is the window.
 *
 * That matters because it is easy to write scroll code against the wrong
 * element and see it quietly do nothing — the container's `scrollTop` stays 0
 * forever while the window is the one holding the offset.
 */

/** Scroll offset worth restoring later — see {@link restoreScroll}. */
export type ScrollMark = number;

/**
 * Send the page back to the top, for when a navigation has replaced what is on
 * screen.
 *
 * Arriving on a new page already scrolled down is disorienting: the heading
 * that says where you are is above the fold, so the page reads as broken or as
 * the wrong one. Browsers do this for real navigations; a view swap inside one
 * document has to do it by hand.
 *
 * Jumps rather than smooth-scrolls. Smooth belongs to movement *within* a page
 * you can see; animating a scrollbar across content that has already been
 * swapped out just delays the new page.
 */
export function scrollToTop(): void {
    if (typeof window === 'undefined') return;
    window.scrollTo(0, 0);
    // Some engines park the offset on one of these rather than the window.
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
}

/** Where the page is now, to hand back to {@link restoreScroll}. */
export function markScroll(): ScrollMark {
    if (typeof window === 'undefined') return 0;
    return window.scrollY;
}

/**
 * Put the page back where {@link markScroll} found it.
 *
 * For going *back* to a list, where losing your place is the annoyance rather
 * than the fix. Deferred a frame because the list it applies to is usually
 * being re-rendered in the same tick, and the page cannot be scrolled to an
 * offset it is not yet tall enough to have.
 */
export function restoreScroll(mark: ScrollMark): void {
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() => window.scrollTo(0, mark));
}
