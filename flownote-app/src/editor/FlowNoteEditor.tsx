import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { Milkdown, useEditor } from '@milkdown/react';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { block } from '@milkdown/plugin-block';
import { useNoteStore } from '../note/noteStore';
import { FlowNoteEditorApi, EditorMode } from './editorTypes';
import { htmlBlockNode } from './plugins/htmlBlock/HtmlBlockNode';

interface FlowNoteEditorProps {
  initialContent?: string;
  onContentChange?: (markdown: string) => void;
  mode?: EditorMode;
}

/**
 * FlowNote 编辑器核心组件
 */
export const FlowNoteEditor = forwardRef<FlowNoteEditorApi, FlowNoteEditorProps>(
  ({ initialContent = '', onContentChange, mode = 'edit' }, ref) => {
    const editorRef = useRef<Editor | null>(null);
    const setComposing = useNoteStore((state) => state.setComposing);

    // 创建编辑器 API
    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        if (!editorRef.current) return '';
        // TODO: 从 Milkdown 获取 Markdown
        return '';
      },

      setMarkdown: (markdown: string) => {
        if (!editorRef.current) return;
        // TODO: 设置 Milkdown 内容
      },

      insertHtmlBlock: (id: string, width = 'normal') => {
        if (!editorRef.current) return;
        // TODO: 插入 HTML Block Node
        console.log('插入 HTML Block:', id, width);
      },

      insertImage: (path: string, alt = '') => {
        if (!editorRef.current) return;
        // TODO: 插入图片
        console.log('插入图片:', path, alt);
      },

      focus: () => {
        if (!editorRef.current) return;
        editorRef.current.action((ctx) => {
          const view = ctx.get(rootCtx);
          if (view && typeof view !== 'string' && 'focus' in view) {
            (view as any).focus();
          }
        });
      },

      setMode: (newMode: EditorMode) => {
        console.log('切换模式:', newMode);
        // TODO: 实现模式切换
      },
    }));

    // 配置 Milkdown 编辑器
    useEditor((root) => {
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialContent);

          // 监听内容变化
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onContentChange?.(markdown);
          });
        })
        .config((ctx) => {
          // IME 输入监听
          const rootElement = ctx.get(rootCtx);
          if (!rootElement || typeof rootElement === 'string') return;

          rootElement.addEventListener('compositionstart', () => {
            setComposing(true);
          });

          rootElement.addEventListener('compositionend', () => {
            setComposing(false);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(block)
        .use(htmlBlockNode);

      editorRef.current = editor;
      return editor;
    }, [initialContent, onContentChange, setComposing]);

    useEffect(() => {
      return () => {
        editorRef.current = null;
      };
    }, []);

    return (
      <div className="flownote-editor" data-mode={mode}>
        <Milkdown />
      </div>
    );
  }
);

FlowNoteEditor.displayName = 'FlowNoteEditor';
