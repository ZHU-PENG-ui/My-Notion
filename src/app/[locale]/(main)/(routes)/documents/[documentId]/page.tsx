"use client";

import { useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import React, { use, useRef, useState, useEffect } from "react";
import { useTitle } from "@/src/hooks/use-title";
import { useTranslations } from "next-intl";
import type { EditorRef } from "@/src/components/Editor";
import { useUser } from "@clerk/clerk-react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Toolbar } from "@/src/components/Toolbar";
import { Cover } from "@/src/components/Cover";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ErrorModal } from "@/src/components/modals/error-modal";

// 注意：这里删除了之前指向 src/lib/rag 的所有 import

const Editor = dynamic(() => import("@/src/components/Editor"), {
  ssr: false,
});

interface DocumentIdPageProps {
  params: Promise<{
    documentId: Id<"documents">;
  }>;
}

// 简单的内存缓存
const documentCache = new Map<string, any>();

export default function DocumentIdPage({ params }: DocumentIdPageProps) {
  const { documentId } = use(params) as { documentId: Id<"documents"> };
  const t = useTranslations("Error");
  const { user } = useUser();

  const document = useQuery(api.documents.getById, {
    documentId,
  });

  // 缓存文档数据
  React.useMemo(() => {
    if (document) {
      documentCache.set(documentId, document);
    }
  }, [document, documentId]);

  const update = useMutation(api.documents.update);

  const editorRef = useRef<EditorRef>(null);
  const updateDebounceRef = useRef<{
    timer: NodeJS.Timeout | null;
    pendingUpdate: { id: Id<'documents'>; content: string } | null
  }>({ timer: null, pendingUpdate: null });

  // 防抖处理的更新函数 (用于保存到数据库)
  const debouncedUpdate = (id: Id<'documents'>, content: string) => {
    if (updateDebounceRef.current.timer) {
      clearTimeout(updateDebounceRef.current.timer);
    }

    updateDebounceRef.current.pendingUpdate = { id, content };

    updateDebounceRef.current.timer = setTimeout(() => {
      if (updateDebounceRef.current.pendingUpdate) {
        const { id, content } = updateDebounceRef.current.pendingUpdate;
        update({ id, content });
        updateDebounceRef.current.pendingUpdate = null;
      }
    }, 1000); // 1秒防抖
  };

  // 强制更新所有待处理的数据库更新
  const flushUpdates = () => {
    if (updateDebounceRef.current.pendingUpdate) {
      const { id, content } = updateDebounceRef.current.pendingUpdate;
      update({ id, content });
      updateDebounceRef.current.pendingUpdate = null;
    }
    if (updateDebounceRef.current.timer) {
      clearTimeout(updateDebounceRef.current.timer);
      updateDebounceRef.current.timer = null;
    }
  };

  // 错误提示模态对话框状态
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalTitle, setErrorModalTitle] = useState("");
  const [errorModalDescription, setErrorModalDescription] = useState("");

  // 将浏览器标题设置为文档标题
  useTitle(document?.title);

  // 清理逻辑：仅保留组件卸载时的数据库更新强制保存
  useEffect(() => {
    return () => {
      flushUpdates();
    };
  }, [documentId]);

  const onChange = (content: string) => {
    // 仅执行数据库更新
    debouncedUpdate(documentId, content);
  };

  const onTitleChange = (title: string) => {
    // 如果需要标题更改时也立即同步某些状态可以在这里处理
    // 目前标题通过 Toolbar 组件内部的异步 mutation 处理
  };

  const handleEnter = () => {
    editorRef.current?.focus();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedDocId = e.dataTransfer.getData("text/plain");
    if (droppedDocId) {
      setErrorModalTitle(t("dragErrorTitle"));
      setErrorModalDescription(t("dragErrorDescription"));
      setErrorModalOpen(true);
    }
  };

  if (document === undefined) {
    return (
      <div>
        <Cover.Skeleton />
        <div className="md:max-w-3xl lg:max-w-4xl mx-auto mt-10">
          <div className="space-y-4 pl-8 pt-4">
            <Skeleton className="h-14 w-[50%]" />
            <Skeleton className="h-14 w-[80%]" />
            <Skeleton className="h-14 w-[40%]" />
            <Skeleton className="h-14 w-[60%]" />
          </div>
        </div>
      </div>
    );
  }

  if (document === null) {
    return <div>Not Found</div>;
  }

  return (
    <div className="pb-40" onDragOver={handleDragOver} onDrop={handleDrop}>
      <Cover url={document.coverImage} />
      <div className="md:max-w-3xl lg:md-max-w-4xl mx-auto">
        <Toolbar
          initialData={document}
          onEnter={handleEnter}
          onTitleChange={onTitleChange}
        />
        <Editor
          ref={editorRef}
          onChange={onChange}
          initialContent={document.content}
        />
      </div>

      <ErrorModal
        open={errorModalOpen}
        onOpenChange={setErrorModalOpen}
        title={errorModalTitle}
        description={errorModalDescription}
      />
    </div>
  );
}