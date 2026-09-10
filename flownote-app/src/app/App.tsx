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
      setCurrentNote(note);

      // 添加一些测试 HTML Blocks
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
    body { padding: 20px; font-family: system-ui; }
    h1 { color: #667eea; }
  </style>
</head>
<body>
  <h1>新的 HTML Block</h1>
  <p>ID: ${newId}</p>
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
