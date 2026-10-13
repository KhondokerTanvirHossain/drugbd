/** The one place the sign-in island leaves the page (tests replace it). */
export function navigate(url: string): void {
  window.location.assign(url);
}
