import { USER_AGENTS } from '@lazyfounders/shared';

/**
 * Manages rotation and distribution of User-Agent strings.
 */
export class UserAgentRotator {
  private readonly agents: string[];
  private currentIndex: number = 0;

  constructor(customAgents?: string[]) {
    this.agents = customAgents?.length ? customAgents : USER_AGENTS;
    
    if (!this.agents || this.agents.length === 0) {
      // Fallback in case USER_AGENTS array is missing or empty
      this.agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ];
    }
  }

  /**
   * Retrieves the next User-Agent in round-robin fashion.
   *
   * @returns A User-Agent string.
   */
  public next(): string {
    const agent = this.agents[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.agents.length;
    return agent;
  }

  /**
   * Retrieves a completely random User-Agent string.
   *
   * @returns A User-Agent string.
   */
  public random(): string {
    const randomIndex = Math.floor(Math.random() * this.agents.length);
    return this.agents[randomIndex];
  }

  /**
   * Retrieves a consistent User-Agent for a specific domain using hashing.
   * This ensures that consecutive requests to the same domain use the same UA.
   *
   * @param domain - The domain to get the User-Agent for.
   * @returns A User-Agent string.
   */
  public getForDomain(domain: string): string {
    const hash = this.hashString(domain);
    const index = Math.abs(hash) % this.agents.length;
    return this.agents[index];
  }

  /**
   * Simple string hashing function.
   * 
   * @param str - The string to hash.
   * @returns The resulting integer hash.
   */
  private hashString(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}
