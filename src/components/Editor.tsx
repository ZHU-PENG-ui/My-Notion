"use client";

import { useEffect, forwardRef, useImperativeHandle } from "react";
import { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";
import { useTheme } from "next-themes";
import { useParams } from "next/navigation";
import * as locales from "@blocknote/core/locales";

import { useEdgeStore } from "@/src/lib/edgestore";
import { getBlockNoteLocale } from "@/src/lib/utils";

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
}

export interface EditorRef {
  focus: () => void;
}

/**
 * 编辑器组件
 * 核心逻辑已清理，仅保留文档编辑、图片上传和多语言功能。
 */
function Editor({ onChange, initialContent, editable = true }: EditorProps, ref: React.Ref<EditorRef>) {
  const { resolvedTheme } = useTheme();
  const { edgestore } = useEdgeStore();
  const params = useParams();
  const locale = (params.locale as string) || "en";

  // 处理图片/文件上传到 EdgeStore
  const handleUpload = async (file: File) => {
    const response = await edgestore.publicFiles.upload({ file });
    return response.url;
  };

  // 初始化 BlockNote 编辑器 (不包含 AI 扩展插件)
  const editor: BlockNoteEditor = useCreateBlockNote({
    initialContent: initialContent
      ? (JSON.parse(initialContent) as PartialBlock[])
      : undefined,
    uploadFile: handleUpload,
    dictionary: locales[getBlockNoteLocale(locale)] || locales.en,
  });

  // 监听内容变化并回调
  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      onChange(JSON.stringify(editor.document, null, 2));
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [editor, onChange]);

  // 暴露给父组件的聚焦方法
  const focusEditor = () => {
    editor.focus();
  };

  useImperativeHandle(ref, () => ({
    focus: focusEditor
  }));

  return (
    <div>
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        editable={editable}
      />
    </div>
  );
}

export default forwardRef<EditorRef, EditorProps>(Editor);