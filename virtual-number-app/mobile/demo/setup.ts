// Web demo bootstrap. Runs once, before the app renders (imported by the
// demo replacements of billing and secure storage, which load early).
import { Alert, type AlertButton } from "react-native";
import { installFakeApi } from "./fake-api";

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

installFakeApi(API_URL);

// react-native-web ignores Alert buttons and browser dialogs may be blocked,
// so render alerts as an in-page dialog.
Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
  const options = buttons?.length ? buttons : [{ text: "OK" }];
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,sans-serif";
  const box = document.createElement("div");
  box.style.cssText = "background:#fff;color:#111827;border-radius:16px;max-width:320px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.25)";
  const h = document.createElement("div");
  h.textContent = title;
  h.style.cssText = "font-weight:700;font-size:17px;margin-bottom:6px";
  box.append(h);
  if (message) {
    const p = document.createElement("div");
    p.textContent = message;
    p.style.cssText = "font-size:14px;color:#4B5563;line-height:1.4;margin-bottom:8px";
    box.append(p);
  }
  for (const b of options) {
    const btn = document.createElement("button");
    btn.textContent = b.text ?? "OK";
    const color = b.style === "destructive" ? "#DC2626" : b.style === "cancel" ? "#6B7280" : "#4F46E5";
    btn.style.cssText = `display:block;width:100%;margin-top:8px;padding:12px;border:0;border-radius:10px;background:#EEF2FF;color:${color};font-size:15px;font-weight:600;cursor:pointer`;
    btn.onclick = () => {
      overlay.remove();
      b.onPress?.();
    };
    box.append(btn);
  }
  overlay.append(box);
  document.body.append(overlay);
  (box.querySelector("button") as HTMLButtonElement | null)?.focus();
};
