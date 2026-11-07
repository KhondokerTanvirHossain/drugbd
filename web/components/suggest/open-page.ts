/**
 * §6.11.1: a header suggestion opens its product page with a full page load. The root layout (top bar, the nav's
 * aria-current, the field's value) renders from the request, so a soft navigation would keep the previous page's bar.
 * Its own module so tests can replace it (jsdom's location cannot be stubbed).
 */
export function openPage(href: string): void {
  window.location.assign(href);
}
