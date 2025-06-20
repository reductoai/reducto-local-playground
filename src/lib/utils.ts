import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ENABLE_LOCAL_PERSIST } from "@/lib/env";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getLocal = (key: string, fallback: string) => {
  if (!ENABLE_LOCAL_PERSIST) return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

export const setLocal = (key: string, value: string) => {
  if (!ENABLE_LOCAL_PERSIST) return;
  try {
    localStorage.setItem(key, value);
  } catch {}
};

export const removeLocal = (key: string) => {
  if (!ENABLE_LOCAL_PERSIST) return;
  try {
    localStorage.removeItem(key);
  } catch {}
};
