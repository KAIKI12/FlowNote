interface FileTreeProps {
  width: number;
  onFileSelect: (file: string) => void;
  activeFile: string | null;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder' | 'note';
  children?: FileNode[];
}

// 模拟文件树数据（后续会用 Tauri API 读取真实文件）
const mockFiles: FileNode[] = [
  {
    name: "FlowNote",
    path: "/",
    type: "folder",
    children: [
      { name: "快速开始.md", path: "/快速开始.md", type: "file" },
      { name: "项目介绍.md", path: "/项目介绍.md", type: "file" },
      { name: "CTS优化.note", path: "/CTS优化.note", type: "note" },
      {
        name: "技术文档",
        path: "/技术文档",
        type: "folder",
        children: [
          { name: "架构设计.md", path: "/技术文档/架构设计.md", type: "file" },
          { name: "API文档.md", path: "/技术文档/API文档.md", type: "file" },
        ],
      },
    ],
  },
];

function FileTree({ width, onFileSelect, activeFile }: FileTreeProps) {
  return (
    <aside className="file-tree" style={{ width: `${width}px` }}>
      <div className="file-tree-header">
        <h2>文件</h2>
        <div className="file-tree-actions">
          <button className="icon-btn" title="新建笔记">
            <span>📝</span>
          </button>
          <button className="icon-btn" title="新建文件夹">
            <span>📁</span>
          </button>
        </div>
      </div>

      <div className="file-tree-content">
        {mockFiles.map((node) => (
          <FileNode
            key={node.path}
            node={node}
            level={0}
            onSelect={onFileSelect}
            activeFile={activeFile}
          />
        ))}
      </div>
    </aside>
  );
}

interface FileNodeProps {
  node: FileNode;
  level: number;
  onSelect: (path: string) => void;
  activeFile: string | null;
}

function FileNode({ node, level, onSelect, activeFile }: FileNodeProps) {
  const isActive = activeFile === node.path;
  const isFolder = node.type === 'folder';

  const icon = node.type === 'folder' ? '📁' : node.type === 'note' ? '📦' : '📄';

  return (
    <div className="file-node">
      <div
        className={`file-node-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => !isFolder && onSelect(node.path)}
      >
        <span className="file-icon">{icon}</span>
        <span className="file-name">{node.name}</span>
      </div>

      {isFolder && node.children && (
        <div className="file-node-children">
          {node.children.map((child) => (
            <FileNode
              key={child.path}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              activeFile={activeFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default FileTree;
