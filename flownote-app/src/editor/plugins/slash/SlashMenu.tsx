/**
 * Slash Menu 组件
 *
 * TODO: 集成 @milkdown/plugin-slash
 * 目前暂时通过按钮触发插入
 */

interface SlashMenuItem {
  id: string;
  title: string;
  icon: string;
  description: string;
  keywords: string[];
  onSelect: () => void;
}

export function SlashMenu() {
  // TODO: 实现 Slash Menu
  return null;
}
