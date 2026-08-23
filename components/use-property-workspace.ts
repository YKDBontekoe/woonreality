"use client";

import { useWorkspaceContext } from "@/components/workspace-provider";

export type { WorkspaceAuthStatus, WorkspaceMutationResult } from "@/components/workspace-provider";

export function usePropertyWorkspace() {
  return useWorkspaceContext();
}
