"use client";

import { Spinner } from "@/src/components/spinner";
import { useConvexAuth } from "convex/react";
import { redirect } from "next/navigation";
import React, { useEffect } from "react";
import { Navigation } from "./_components/Navigation";
import { SearchCommand } from "@/src/components/search-command";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations();

  // 快捷键监听：处理 Ctrl+S / Command+S 的模拟保存逻辑
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 检查是否按下了 Ctrl+S 或 Command+S
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault(); // 阻止浏览器默认保存行为
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleSave = () => {
    // 显示“保存中”提示
    const toastId = toast.loading(t("common.saving"), {
      duration: 500
    });

    // 500ms 后显示“保存成功”提示
    setTimeout(() => {
      toast.success(t("common.saved"), {
        id: toastId
      });
    }, 500);
  };

  // 认证加载中状态
  if (isLoading) {
    return (
      <div className="h-full flex justify-center items-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // 路由守卫：未登录用户重定向至首页
  if (!isAuthenticated) {
    return redirect("/");
  }

  return (
    <div className="h-full flex dark:bg-[#1F1F1F]">
      <Navigation />
      <main className="flex-1 h-full overflow-y-auto">
        <SearchCommand />
        {children}
      </main>
    </div>
  );
}
