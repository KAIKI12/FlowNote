import { useState } from "react";
import FileTree from "./components/FileTree";
import Editor from "./components/Editor";
import Inspector from "./components/Inspector";

function App() {
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>("# 欢迎使用 FlowNote\n\n开始编写你的笔记...");
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(280);

  return (
    <div className="app">
      <FileTree
        width={leftWidth}
        onFileSelect={setActiveFile}
        activeFile={activeFile}
      />

      <div
        className="resizer resizer-left"
        onMouseDown={(e) => handleResize(e, 'left', setLeftWidth)}
      />

      <Editor
        content={content}
        onChange={setContent}
        fileName={activeFile}
      />

      <div
        className="resizer resizer-right"
        onMouseDown={(e) => handleResize(e, 'right', setRightWidth)}
      />

      <Inspector
        width={rightWidth}
        content={content}
      />
    </div>
  );
}

function handleResize(
  e: React.MouseEvent,
  side: 'left' | 'right',
  setWidth: (width: number) => void
) {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = side === 'left'
    ? (e.currentTarget.previousElementSibling as HTMLElement)?.offsetWidth || 240
    : (e.currentTarget.nextElementSibling as HTMLElement)?.offsetWidth || 280;

  const onMouseMove = (moveEvent: MouseEvent) => {
    const delta = side === 'left'
      ? moveEvent.clientX - startX
      : startX - moveEvent.clientX;

    const newWidth = Math.max(180, Math.min(500, startWidth + delta));
    setWidth(newWidth);
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

export default App;
