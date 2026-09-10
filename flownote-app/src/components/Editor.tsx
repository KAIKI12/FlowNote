import { useState } from "react";

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  fileName: string | null;
}

function Editor({ content, onChange, fileName }: EditorProps) {
  const [localContent, setLocalContent] = useState(content);

  const handleChange = (value: string) => {
    setLocalContent(value);
    onChange(value);
  };

  return (
    <main className="editor">
      <div className="editor-header">
        <div className="editor-title">
          {fileName ? (
            <span>{fileName.split('/').pop()}</span>
          ) : (
            <span className="editor-title-placeholder">未选择文件</span>
          )}
        </div>
        <div className="editor-actions">
          <button className="editor-btn active">编辑</button>
          <button className="editor-btn">阅读</button>
          <button className="editor-btn">演示</button>
        </div>
      </div>

      <div className="editor-content">
        <div className="markdown-editor">
          <textarea
            className="markdown-textarea"
            value={localContent}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="开始编写你的笔记..."
            spellCheck={false}
          />
        </div>
      </div>
    </main>
  );
}

export default Editor;
