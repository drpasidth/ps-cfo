export const THEMES = [
  { id: "white", label: "ขาว (White)" },
  { id: "dark", label: "มืด (Dark)" },
  { id: "navy", label: "น้ำเงินเข้ม (Navy Blue)" },
  { id: "green", label: "เขียวธรรมชาติ (Natural Green)" },
  { id: "earth", label: "โทนดิน (Earth Tone)" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "cfo-theme";

export function getTheme(): ThemeId {
  const saved = localStorage.getItem(STORAGE_KEY);
  return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : "white";
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(STORAGE_KEY, id);
}
