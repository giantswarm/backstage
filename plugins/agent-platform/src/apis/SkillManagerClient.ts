import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import { callManagerTool, type ManagerErrors } from '../lib/managerToolCall';
import {
  skillManagerToolName,
  type SkillManagerFile,
  type SkillManagerListing,
  type SkillManagerSkill,
  type SkillManagerTool,
} from '../lib/skillManager';

const SKILL_MANAGER_ERRORS: ManagerErrors = {
  classify: error =>
    error instanceof Error ? error : new Error(String(error)),
  notJSON: message => new Error(message),
};

/**
 * skill-manager's tools on one installation, called as the signed-in person
 * through the installation's muster: the portal knows skill-manager only as
 * `x_skill-manager_<tool>`. A private repository is listed and read only for
 * a person whose GitHub login can read it.
 */
export class SkillManagerClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private call<T>(
    tool: SkillManagerTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    return callManagerTool<T>(
      this.musterApi,
      this.installation,
      skillManagerToolName(tool),
      args,
      SKILL_MANAGER_ERRORS,
    );
  }

  /**
   * The person's muster token for this installation, for gs-backend to read
   * skill-manager's sources as them.
   */
  authHeaders(): Promise<Record<string, string>> {
    return this.musterApi.authHeaders(this.installation);
  }

  listSkills(): Promise<SkillManagerListing> {
    return this.call<SkillManagerListing>('list_skills', {});
  }

  getSkill(skill: {
    repoUrl: string;
    commit: string;
    path: string;
  }): Promise<SkillManagerSkill> {
    return this.call<SkillManagerSkill>('get_skill', {
      url: skill.repoUrl,
      commit: skill.commit,
      path: skill.path,
    });
  }

  getSkillFile(
    skill: { repoUrl: string; commit: string; path: string },
    file: string,
  ): Promise<SkillManagerFile> {
    return this.call<SkillManagerFile>('get_skill_file', {
      url: skill.repoUrl,
      commit: skill.commit,
      path: skill.path,
      file,
    });
  }
}
