/** Classic `ghp_` / `gho_` / `ghu_` / `ghs_` / `ghr_` и fine-grained `github_pat_`. */
const TOKEN_RE = /^(?:github_pat_[A-Za-z0-9_]{20,240}|gh[pousr]_[A-Za-z0-9_]{20,240})$/

export function assertGithubToken(raw: string): string {
  const token = raw.trim()
  if (!TOKEN_RE.test(token)) {
    throw new Error('Нужен personal access token GitHub (ghp_… или github_pat_…).')
  }
  return token
}
