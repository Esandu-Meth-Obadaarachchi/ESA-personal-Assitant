"use client";

import { useCallback } from "react";
import { useWorkspace } from "./WorkspaceContext";
import type { NavigateCardData } from "@/lib/types";

/**
 * Apply the workspace/project selection a `navigate` card asks for, before its
 * route is pushed. Shared by voice and the agent chat card so the cross-workspace
 * rule lives in one place.
 *
 * The rule: `selectProject` only looks inside the *current* workspace's projects,
 * so a project id from another workspace resolves to null and the screen never
 * changes. `openWorkspaceProject` is the bridge — it stashes the project, switches
 * workspace, and selects it once that workspace's projects load. Using it within
 * the current workspace would instead clear the selection (the workspace id does
 * not change, so nothing re-runs to restore it), hence the branch.
 */
export function useNavSelection() {
  const { currentWorkspace, selectWorkspace, selectProject, openWorkspaceProject } = useWorkspace();

  return useCallback(
    (nav: NavigateCardData) => {
      const targetWs = nav.workspaceId;
      const crossWorkspace = !!targetWs && targetWs !== currentWorkspace?.id;

      if (nav.projectId) {
        if (crossWorkspace && targetWs) openWorkspaceProject(targetWs, nav.projectId);
        else selectProject(nav.projectId);
        return;
      }
      if (crossWorkspace && targetWs) selectWorkspace(targetWs);
    },
    [currentWorkspace?.id, openWorkspaceProject, selectProject, selectWorkspace]
  );
}
