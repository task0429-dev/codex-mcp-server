import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";

const ListReposSchema = z.object({
  owner: z.string().optional().describe("Repository owner (defaults to authenticated user)"),
  agentName: z.string().describe("Agent requesting access")
});

const GetRepoSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  agentName: z.string().describe("Agent requesting access")
});

const ListIssuesSchema = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  state: z.enum(["open", "closed", "all"]).optional().default("open"),
  agentName: z.string().describe("Agent requesting access")
});

const SearchCodeSchema = z.object({
  query: z.string().describe("Search query"),
  repo: z.string().optional().describe("Limit to specific repo (owner/repo)"),
  agentName: z.string().describe("Agent requesting access")
});

/**
 * GitHub integration using GitHub API with permission controls
 */
export class GitHubIntegration {
  private static octokit: Octokit | null = null;

  /**
   * Initialize GitHub client
   */
  private static getClient(): Octokit {
    if (!this.octokit) {
      const token = config.GITHUB_TOKEN;
      if (!token) {
        throw new Error("GitHub token not configured. Set GITHUB_TOKEN in environment variables.");
      }
      this.octokit = new Octokit({ auth: token });
    }
    return this.octokit;
  }

  /**
   * List repositories
   */
  static async listRepos(input: z.infer<typeof ListReposSchema>) {
    const { owner, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "github", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for GitHub`);
    }

    try {
      const client = this.getClient();
      const response = owner
        ? await client.repos.listForUser({ username: owner })
        : await client.repos.listForAuthenticatedUser();

      const repos = response.data.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        html_url: repo.html_url,
        updated_at: repo.updated_at
      }));

      logger.info(`Agent ${agentName} listed ${repos.length} GitHub repos for ${owner || 'self'}`);
      return { repos, count: repos.length };
    } catch (error) {
      logger.error(`GitHub list repos error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Get repository details
   */
  static async getRepo(input: z.infer<typeof GetRepoSchema>) {
    const { owner, repo, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "github", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for GitHub`);
    }

    try {
      const client = this.getClient();
      const response = await client.repos.get({ owner, repo });

      logger.info(`Agent ${agentName} retrieved GitHub repo: ${owner}/${repo}`);
      return {
        repo: {
          name: response.data.name,
          full_name: response.data.full_name,
          description: response.data.description,
          html_url: response.data.html_url,
          clone_url: response.data.clone_url,
          default_branch: response.data.default_branch,
          language: response.data.language,
          stars: response.data.stargazers_count,
          forks: response.data.forks_count
        }
      };
    } catch (error) {
      logger.error(`GitHub get repo error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * List repository issues
   */
  static async listIssues(input: z.infer<typeof ListIssuesSchema>) {
    const { owner, repo, state, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "github", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for GitHub`);
    }

    try {
      const client = this.getClient();
      const response = await client.issues.listForRepo({ owner, repo, state });

      const issues = response.data.map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        html_url: issue.html_url,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        user: issue.user?.login,
        labels: issue.labels.map((label: any) => label.name)
      }));

      logger.info(`Agent ${agentName} listed ${issues.length} issues for ${owner}/${repo}`);
      return { issues, count: issues.length };
    } catch (error) {
      logger.error(`GitHub list issues error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Search code in repositories
   */
  static async searchCode(input: z.infer<typeof SearchCodeSchema>) {
    const { query, repo, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "github", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for GitHub`);
    }

    try {
      const client = this.getClient();
      const q = repo ? `${query} repo:${repo}` : query;
      const response = await client.search.code({ q, per_page: 30 });

      const results = response.data.items.map(item => ({
        name: item.name,
        path: item.path,
        html_url: item.html_url,
        repository: item.repository.full_name,
        score: item.score
      }));

      logger.info(`Agent ${agentName} searched GitHub code: "${query}" - ${results.length} results`);
      return {
        results,
        total_count: response.data.total_count,
        incomplete_results: response.data.incomplete_results
      };
    } catch (error) {
      logger.error(`GitHub search code error for ${agentName}: ${error}`);
      throw error;
    }
  }
}

// Tool definitions for MCP
export const githubTools = [
  {
    name: "github_list_repos",
    description: "List GitHub repositories for a user or organization",
    inputSchema: ListReposSchema,
    handler: GitHubIntegration.listRepos.bind(GitHubIntegration)
  },
  {
    name: "github_get_repo",
    description: "Get details of a specific GitHub repository",
    inputSchema: GetRepoSchema,
    handler: GitHubIntegration.getRepo.bind(GitHubIntegration)
  },
  {
    name: "github_list_issues",
    description: "List issues for a GitHub repository",
    inputSchema: ListIssuesSchema,
    handler: GitHubIntegration.listIssues.bind(GitHubIntegration)
  },
  {
    name: "github_search_code",
    description: "Search for code across GitHub repositories",
    inputSchema: SearchCodeSchema,
    handler: GitHubIntegration.searchCode.bind(GitHubIntegration)
  }
];