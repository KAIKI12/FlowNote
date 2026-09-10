import { useState, useRef, useEffect } from "react";
import { MilkdownProvider } from "@milkdown/react";
import { FlowNoteEditor } from "../editor/FlowNoteEditor";
import { FlowNoteEditorApi } from "../editor/editorTypes";
import { useNoteStore } from "../note/noteStore";
import { loadNote } from "../note/noteLoader";
import { AutoSaver } from "../note/noteSaver";

function App() {
  const [activeView, setActiveView] = useState<string>("editor");
  const editorRef = useRef<FlowNoteEditorApi>(null);
  const autoSaver = useRef(new AutoSaver(500));

  const { currentNote, setCurrentNote, updateContent, addHtmlBlock } = useNoteStore();

  // 初始化：加载测试笔记
  useEffect(() => {
    loadNote("test.note").then((note) => {
      // 设置初始 Markdown 内容（包含 HTML Block 引用）
      note.contentMd = `# FlowNote 测试笔记

欢迎使用 FlowNote！这是一个混合笔记系统。

## Markdown 内容

这是普通的 Markdown 文本。你可以：

- 写作
- **加粗**
- *斜体*
- 代码 \`inline code\`

## HTML Block 演示

下面是一个 HTML Block：

\`\`\`flownote-html
{"id":"html_001"}
\`\`\`

继续写 Markdown...

## 功能测试

点击左侧的 "➕ 插入 HTML Block" 按钮可以插入新的 HTML Block。
`;

      setCurrentNote(note);

      // 添加测试 HTML Block
      addHtmlBlock(
        "html_001",
        `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 200px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      margin: 0;
      font-family: system-ui;
    }
    .card {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
    }
    h2 { color: #667eea; margin: 0 0 10px 0; }
    p { margin: 0; color: #666; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🎯 HTML Block Demo</h2>
    <p>这是一个测试 HTML Block</p>
  </div>
</body>
</html>`
      );
    });
  }, [setCurrentNote, addHtmlBlock]);

  const handleContentChange = (markdown: string) => {
    updateContent(markdown);
    if (currentNote) {
      autoSaver.current.schedule({
        ...currentNote,
        contentMd: markdown,
      });
    }
  };

  const handleInsertHtmlBlock = () => {
    if (!editorRef.current) return;

    // 生成新的 HTML Block ID
    const newId = `html_${String(Date.now()).slice(-3).padStart(3, "0")}`;

    // 添加示例 HTML 内容
    addHtmlBlock(
      newId,
      `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      padding: 20px;
      font-family: system-ui;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 150px;
    }
    .content {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 { color: #667eea; margin: 0 0 10px 0; font-size: 20px; }
    p { margin: 0; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="content">
    <h1>✨ 新的 HTML Block</h1>
    <p>ID: ${newId}</p>
    <p>创建时间: ${new Date().toLocaleTimeString()}</p>
  </div>
</body>
</html>`
    );

    // 插入到编辑器
    editorRef.current.insertHtmlBlock(newId);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>FlowNote</h1>
        <nav>
          <button
            className={activeView === "editor" ? "active" : ""}
            onClick={() => setActiveView("editor")}
          >
            📝 编辑器
          </button>
          <button
            className={activeView === "demo" ? "active" : ""}
            onClick={() => setActiveView("demo")}
          >
            🔍 演示
          </button>
        </nav>

        <div className="sidebar-section">
          <h3>操作</h3>
          <button onClick={handleInsertHtmlBlock}>
            ➕ 插入 HTML Block
          </button>
        </div>
      </aside>

      <main className="content">
        {activeView === "editor" && (
          <MilkdownProvider>
            <FlowNoteEditor
              ref={editorRef}
              initialContent={currentNote?.contentMd || ""}
              onContentChange={handleContentChange}
            />
          </MilkdownProvider>
        )}

        {activeView === "demo" && <DemoView />}
      </main>
    </div>
  );
}

function DemoView() {
  const currentNote = useNoteStore((state) => state.currentNote);

  return (
    <div className="demo-view">
      <h2>当前 Note 状态</h2>

      <section>
        <h3>Metadata</h3>
        <pre>{JSON.stringify(currentNote?.metadata, null, 2)}</pre>
      </section>

      <section>
        <h3>Content.md</h3>
        <pre>{currentNote?.contentMd}</pre>
      </section>

      <section>
        <h3>HTML Blocks</h3>
        <ul>
          {Array.from(currentNote?.htmlBlocks.entries() || []).map(([id, content]) => (
            <li key={id}>
              <strong>{id}</strong>: {content.length} 字符
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;
