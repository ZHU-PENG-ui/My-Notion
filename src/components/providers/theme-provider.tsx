"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // 注意：此处不需要额外的 mounted 检查逻辑，
  // 因为 next-themes 内部已经处理了服务端渲染逻辑。
  // 关键在于 layout.tsx 中的 HTML 配置。
  return (
    <NextThemesProvider {...props}>
      {children}
    </NextThemesProvider>
  );
}