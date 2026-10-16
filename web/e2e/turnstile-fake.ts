import type { Page } from "@playwright/test";

/**
 * Serves a stand-in for Cloudflare's api.js. "pass" hands every widget the documented dummy token, which the
 * test secret accepts; "error" calls the widget's error callback, as a blocked or failed challenge does. Like the real
 * widget, it keeps the token in a hidden input (named by "response-field-name") inside the container, so a plain form
 * POST carries it.
 */
export async function installTurnstileFake(page: Page, mode: "pass" | "error" | "error-once"): Promise<void> {
  // "error-once": the first challenge fails, every later one (after reset, as Retry check does) passes.
  const body = `(() => {
    const widgets = new Map(); let n = 0, fired = 0;
    const MODE = ${JSON.stringify(mode)};
    function field(w, value) {
      if (w.o["response-field"] === false) return;
      const name = w.o["response-field-name"] || "cf-turnstile-response";
      let input = w.el.querySelector('input[name="' + name + '"]');
      if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; w.el.appendChild(input); }
      input.value = value;
    }
    function fire(id) {
      const w = widgets.get(id); if (!w) return; const o = w.o;
      const fail = MODE === "error" || (MODE === "error-once" && fired++ === 0);
      field(w, "");
      setTimeout(() => {
        if (fail) { o["error-callback"] && o["error-callback"]("110200"); }
        else { field(w, "XXXX.DUMMY.TOKEN.XXXX"); o.callback && o.callback("XXXX.DUMMY.TOKEN.XXXX"); }
      }, 50);
    }
    window.turnstile = {
      render(el, o) { const id = "fake-" + (++n); widgets.set(id, { el, o }); fire(id); return id; },
      reset(id) { fire(id ?? [...widgets.keys()].pop()); },
      remove(id) { widgets.delete(id); },
      getResponse() { return MODE === "error" ? undefined : "XXXX.DUMMY.TOKEN.XXXX"; },
      isExpired() { return false; },
      ready(cb) { cb(); },
    };
  })();`;
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body }));
}
