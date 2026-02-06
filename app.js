console.log("app.js loaded");

// Create or read device token (safe JS, no Chinese keywords)
function getOrCreateDeviceToken() {
  const KEY = "device_token_v1";
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random();
    localStorage.setItem(KEY, t);
  }
  return t;
}

// Simple render (avoid any translation issues)
document.addEventListener("DOMContentLoaded", () => {
  const p = document.createElement("p");
  p.textContent = "Device token: " + getOrCreateDeviceToken();
  document.body.appendChild(p);
});
