"use client";

import { createContext, useContext, useMemo } from "react";
import { Direction } from "radix-ui";
import { dirOf, type Locale } from "./config";
import { createT, type Dictionary, type T } from "./translate";

const I18nContext = createContext<T>(createT("en", {}));

/** Gives client components the request's language; also sets reading direction for menus and popovers. */
export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dictionary; children: React.ReactNode }) {
  const t = useMemo(() => createT(locale, dict), [locale, dict]);
  return (
    <I18nContext value={t}>
      <Direction.Provider dir={dirOf(locale)}>{children}</Direction.Provider>
    </I18nContext>
  );
}

export const useT = () => useContext(I18nContext);
