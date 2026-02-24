import type { FolderTreeNode } from './apiClient.ts';

export type FolderTreeStateNode = {
  path: string;
  parentPath: string | null;
  imageCount: number;
  checked: boolean;
  indeterminate: boolean;
  expanded: boolean;
  children: string[];
};

export type FolderTreeState = {
  nodes: Record<string, FolderTreeStateNode>;
  rootPaths: string[];
};

export type FolderTreeFlatNode = FolderTreeStateNode & { depth: number };

function baseName(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/');
  const pieces = normalizedPath.split('/').filter((p) => p.length > 0);
  return pieces[pieces.length - 1] ?? path;
}

export function folderLabel(path: string, imageCount: number): string {
  return `${baseName(path)} (${imageCount})`;
}

export function deriveFolderTree(
  nodes: FolderTreeNode[],
  previous: FolderTreeState | null,
  expandedPaths?: Set<string>,
): FolderTreeState {
  const nextNodes: Record<string, FolderTreeStateNode> = {};
  for (const node of nodes) {
    nextNodes[node.path] = {
      path: node.path,
      parentPath: node.parentPath,
      imageCount: node.imageCount,
      checked: node.checked,
      indeterminate: false,
      expanded: expandedPaths
        ? expandedPaths.has(node.path)
        : (previous?.nodes[node.path]?.expanded ?? false),
      children: [],
    };
  }

  const rootPaths: string[] = [];
  for (const node of Object.values(nextNodes)) {
    if (node.parentPath && nextNodes[node.parentPath]) {
      const parent = nextNodes[node.parentPath];
      if (parent) {
        parent.children.push(node.path);
      }
    } else {
      rootPaths.push(node.path);
    }
  }

  for (const node of Object.values(nextNodes)) {
    node.children.sort((a, b) => a.localeCompare(b));
  }
  rootPaths.sort((a, b) => a.localeCompare(b));

  const compute = (path: string): { allChecked: boolean; anyMarked: boolean } => {
    const node = nextNodes[path];
    if (!node) return { allChecked: false, anyMarked: false };

    if (node.checked) {
      node.indeterminate = false;
      return { allChecked: true, anyMarked: true };
    }

    if (node.children.length === 0) {
      node.indeterminate = false;
      return { allChecked: false, anyMarked: false };
    }

    let allChecked = true;
    let anyMarked = false;
    for (const childPath of node.children) {
      const child = compute(childPath);
      allChecked = allChecked && child.allChecked;
      anyMarked = anyMarked || child.anyMarked;
    }

    if (allChecked) {
      node.checked = true;
      node.indeterminate = false;
      return { allChecked: true, anyMarked: true };
    }

    if (anyMarked) {
      node.checked = false;
      node.indeterminate = true;
      return { allChecked: false, anyMarked: true };
    }

    node.checked = false;
    node.indeterminate = false;
    return { allChecked: false, anyMarked: false };
  };

  for (const rootPath of rootPaths) {
    compute(rootPath);
  }

  return { nodes: nextNodes, rootPaths };
}

export function flattenVisibleTree(state: FolderTreeState): FolderTreeFlatNode[] {
  const flat: FolderTreeFlatNode[] = [];
  const walk = (path: string, depth: number) => {
    const node = state.nodes[path];
    if (!node) return;
    flat.push({ ...node, depth });
    if (!node.expanded) return;
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  };

  for (const rootPath of state.rootPaths) {
    walk(rootPath, 0);
  }

  return flat;
}

export function countCheckedRoots(state: FolderTreeState): number {
  return Object.values(state.nodes).filter((node) => node.checked).length;
}

export function applyCheckedSubtree(
  state: FolderTreeState,
  path: string,
  checked: boolean,
): FolderTreeState {
  const source = state.nodes[path];
  if (!source) return state;

  const nodes: Record<string, FolderTreeStateNode> = { ...state.nodes };

  const markSubtree = (targetPath: string) => {
    const target = nodes[targetPath];
    if (!target) return;
    nodes[targetPath] = { ...target, checked, indeterminate: false };
    for (const child of target.children) {
      markSubtree(child);
    }
  };

  const recomputeUp = (targetPath: string | null) => {
    if (!targetPath) return;
    const target = nodes[targetPath];
    if (!target) return;
    if (target.children.length === 0) {
      target.indeterminate = false;
      return;
    }

    let allChecked = true;
    let anyMarked = false;
    for (const childPath of target.children) {
      const child = nodes[childPath];
      if (!child) continue;
      allChecked = allChecked && child.checked;
      anyMarked = anyMarked || child.checked || child.indeterminate;
    }

    if (allChecked) {
      nodes[targetPath] = { ...target, checked: true, indeterminate: false };
    } else if (anyMarked) {
      nodes[targetPath] = { ...target, checked: false, indeterminate: true };
    } else {
      nodes[targetPath] = { ...target, checked: false, indeterminate: false };
    }

    const parentPath = nodes[targetPath].parentPath;
    recomputeUp(parentPath);
  };

  markSubtree(path);
  recomputeUp(nodes[path]?.parentPath ?? null);

  return { ...state, nodes };
}
