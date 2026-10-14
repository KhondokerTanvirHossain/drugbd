"use client";
import { useState, type MouseEvent } from "react";
import Segmented from "@/components/ui/Segmented";
import { DESK_NEW } from "@/lib/copy";
import { DESK_SETTINGS_EVENT, KEYS_COOKIE, deskCookieString, type KeysSetting } from "@/lib/desk-settings";
import { setDeskSettingAction } from "@/lib/desk-settings-actions";

/**
 * "Single-key shortcuts: On / Off" (§5.14) for the account menu. A form POST without JavaScript; with it, a click writes
 * the cookie and tells the desk at once.
 */
export default function KeysSwitch({ value }: { value: KeysSetting }) {
  const [keys, setKeys] = useState<KeysSetting>(value);
  const s = DESK_NEW.deskSettings;
  function choose(e: MouseEvent<HTMLButtonElement>, next: KeysSetting) {
    e.preventDefault();
    document.cookie = deskCookieString(KEYS_COOKIE, next, window.location.protocol === "https:");
    setKeys(next);
    window.dispatchEvent(new CustomEvent(DESK_SETTINGS_EVENT, { detail: { keys: next } }));
  }
  return (
    <form action={setDeskSettingAction}>
      <Segmented ariaLabel={s.keysLabel} name="keys" value={keys} onSelect={choose}
        options={[{ value: "on", label: s.on }, { value: "off", label: s.off }]} />
    </form>
  );
}
