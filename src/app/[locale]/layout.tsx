import "./globals.css";
import { Toaster } from "sonner";
import type { Metadata } from "next";
// 🔥 导入 Next.js 官方 Script 组件（唯一新增导入）
import Script from "next/script";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/src/i18n/routing";

import { ThemeProvider } from "@/src/components/providers/theme-provider";
import { ConvexClientProvider } from "@/src/components/providers/convex-provider";
import { ModalProvider } from "@/src/components/providers/modal-provider";
import { EdgeStoreProvider } from "@/src/lib/edgestore";

export async function generateMetadata({
  params,
}: {
  params: Promise<{
    locale: string;
  }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Layout" });

  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: [
        {
          media: "(prefers-color-scheme: light)",
          url: "/logo.svg",
          href: "/logo.svg",
        },
        {
          media: "(prefers-color-scheme: dark)",
          url: "/logo-dark.svg",
          href: "/logo-dark.svg",
        },
      ],
    },
  };
}

interface RootLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export default async function RootLayout({
  children,
  params,
}: RootLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  return (
    <html lang={locale} suppressHydrationWarning={true}>
      <body className="antialiased">
        {/* 🔥 终极修复：使用 Next.js 官方 Script 组件 */}
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                let theme = localStorage.getItem('notion-clone-2') || 'system';
                if (theme === 'system') {
                  theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                document.documentElement.classList.add(theme);
              })()
            `,
          }}
        />

        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="notion-clone-2"
        >
          <ConvexClientProvider>
            <EdgeStoreProvider>
              <NextIntlClientProvider
                locale={locale}
                messages={messages}
              >
                <Toaster position="top-center" />
                <ModalProvider />
                {children}
              </NextIntlClientProvider>
            </EdgeStoreProvider>
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}