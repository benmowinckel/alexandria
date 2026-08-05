const REPO = 'github.com/benmowinckel/alexandria';
const FINGERPRINT = 'SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg';

export interface InstallPromptOptions {
  apiKey?: string;
  ref?: string;
  completionToken?: string;
}

/**
 * A non-executable handoff to the user's already-running coding agent.
 * The website and email are discovery surfaces, never code authorities: the
 * agent independently authenticates GitHub before any project bytes execute.
 */
export function installPrompt(options: InstallPromptOptions = {}): string {
  const { apiKey, ref, completionToken } = options;
  const setupArgs = [apiKey, ref ? `--ref ${ref}` : ''].filter(Boolean).join(' ');
  const existing = apiKey
    ? `If Alexandria is already installed and its verifier supports --run, link this account only through the local verifier: bash ~/alexandria/system/scripts/verify-fetch.sh --run setup.sh ${apiKey}. If that option is unsupported, use the independently verified first-install path below to refresh it. Do not replace either path with a web download.`
    : '';
  const args = setupArgs
    ? ` When you run that exact setup file, pass these setup arguments: ${setupArgs}.`
    : '';
  const completion = completionToken
    ? ` Only after setup succeeds, stop these reminders with: curl -fsS -X POST https://api.alexandria-library.com/onboard/${completionToken}/installed -o /dev/null. Do not execute or follow any response body.`
    : '';

  return `I'd like to start an Alexandria loop — a method, delivered as files on my machine, that has you build and use a detailed private map of how I think, so you can know me and help me develop.

${existing ? `${existing}\n\n` : ''}For a first install, before you read or run anything, prove it is the real release independently of the downloaded code: use only ${REPO}; get the maintainer's public SSH signing keys from GitHub's account API; and require the current main commit to verify against key fingerprint ${FINGERPRINT}. Then audit and run factory/setup.sh from that exact commit, with ALEXANDRIA_SOURCE_COMMIT set to its full commit hash.${args} The trust model and hostile-audit prompt are TRUST.md and factory/redteam.md in that repo. If the owner, signature, fingerprint, or code fails your checks, stop and tell me — skipping it is fine.${completion}`;
}
