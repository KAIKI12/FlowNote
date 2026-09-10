import { useNoteStore } from '../../../note/noteStore';
import { HtmlSandbox } from '../../../html/HtmlSandbox';

interface HtmlBlockViewProps {
  blockId: string;
  width: 'normal' | 'wide' | 'full';
}

/**
 * HTML Block React 视图组件
 */
export function HtmlBlockView({ blockId, width }: HtmlBlockViewProps) {
  const currentNote = useNoteStore((state) => state.currentNote);

  // 从当前 Note 获取 HTML 内容
  const htmlContent = currentNote?.htmlBlocks.get(blockId) || '<p>HTML Block 加载中...</p>';

  return (
    <div className={`html-block-container html-block-container--${width}`}>
      <div className="html-block-header">
        <span className="html-block-label">HTML</span>
        <span className="html-block-id">{blockId}</span>
        <div className="html-block-toolbar">
          <button title="编辑">✏️</button>
          <button title="全屏">⛶</button>
          <button title="更多">⋯</button>
        </div>
      </div>
      <HtmlSandbox content={htmlContent} />
    </div>
  );
}
