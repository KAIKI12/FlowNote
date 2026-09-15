import { useEffect, useRef } from 'react';
import { configureSandbox } from './htmlPolicy';
import type { HtmlBlockConfig } from '../note/mixedTypes';

interface HtmlSandboxProps {
  content: string;
  className?: string;
  config?: HtmlBlockConfig;
  networkAllowed?: boolean;
}

/**
 * HTML 沙箱隔离渲染组件
 */
export function HtmlSandbox({ content, className = '', config, networkAllowed = false }: HtmlSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    configureSandbox(iframeRef.current, { html: content, config, networkAllowed });
  }, [content, config, networkAllowed]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      className={`html-sandbox ${className}`}
      title="HTML Block Content"
    />
  );
}
