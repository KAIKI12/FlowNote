import { useState } from "react";

interface InspectorProps {
  width: number;
  content: string;
}

type InspectorTab = "outline" | "blocks" | "properties";

function Inspector({ width, content }: InspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("outline");

  // 简单解析 Markdown 标题作为大纲
  const outline = parseOutline(content);

  return (
    <aside className="inspector" style={{ width: `${width}px` }}>
      <div className="inspector-tabs">
        <button
          className={`inspector-tab ${activeTab === "outline" ? "active" : ""}`}
          onClick={() => setActiveTab("outline")}
        >
          📋 大纲
        </button>
        <button
          className={`inspector-tab ${activeTab === "blocks" ? "active" : ""}`}
          onClick={() => setActiveTab("blocks")}
        >
          🧩 Block
        </button>
        <button
          className={`inspector-tab ${activeTab === "properties" ? "active" : ""}`}
          onClick={() => setActiveTab("properties")}
        >
          ⚙️ 属性
        </button>
      </div>

      <div className="inspector-content">
        {activeTab === "outline" && <OutlineView outline={outline} />}
        {activeTab === "blocks" && <BlocksView />}
        {activeTab === "properties" && <PropertiesView />}
      </div>
    </aside>
  );
}

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

function parseOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split("\n");
  const outline: OutlineItem[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      outline.push({
        level: match[1].length,
        text: match[2],
        line: index + 1,
      });
    }
  });

  return outline;
}

function OutlineView({ outline }: { outline: OutlineItem[] }) {
  if (outline.length === 0) {
    return (
      <div className="inspector-empty">
        <p>文档中暂无标题</p>
      </div>
    );
  }

  return (
    <div className="outline-list">
      {outline.map((item, index) => (
        <div
          key={index}
          className="outline-item"
          style={{ paddingLeft: `${(item.level - 1) * 12 + 12}px` }}
        >
          <span className="outline-bullet">•</span>
          <span className="outline-text">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function BlocksView() {
  return (
    <div className="blocks-list">
      <div className="inspector-empty">
        <p>当前笔记中无 HTML Block</p>
        <button className="add-block-btn">+ 添加 HTML Block</button>
      </div>
    </div>
  );
}

function PropertiesView() {
  return (
    <div className="properties-list">
      <div className="property-item">
        <label>标题</label>
        <input type="text" placeholder="笔记标题" />
      </div>
      <div className="property-item">
        <label>标签</label>
        <input type="text" placeholder="添加标签..." />
      </div>
      <div className="property-item">
        <label>创建时间</label>
        <span className="property-value">2026-09-09 21:30</span>
      </div>
      <div className="property-item">
        <label>修改时间</label>
        <span className="property-value">2026-09-09 21:30</span>
      </div>
    </div>
  );
}

export default Inspector;
