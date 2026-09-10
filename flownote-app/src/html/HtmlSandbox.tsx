import { useEffect, useRef } from 'react';

interface HtmlSandboxProps {
  content: string;
  className?: string;
}

/**
 * HTML 沙箱隔离渲染组件
 */
export function HtmlSandbox({ content, className = '' }: HtmlSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    // 使用 srcdoc 注入内容，避免跨域问题
    iframeRef.current.srcdoc = content;
  }, [content]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      className={`html-sandbox ${className}`}
      title="HTML Block Content"
    />
  );
}
