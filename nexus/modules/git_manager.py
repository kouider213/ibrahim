"""
NEXUS Git Manager
Exécute de vraies opérations git sur le projet ibrahim (ou tout autre répertoire).
Supporte: status, diff, log, commit, push, pull, branch, stash.
"""
import logging
import re
import subprocess
from pathlib import Path

log = logging.getLogger('nexus.git')

IBRAHIM_DIR = str(Path.home() / 'OneDrive' / 'Bureau' / 'ibrahim' / 'ibrahim')

_GIT_KEYWORDS = re.compile(
    r'\b(git|commit|push|pull|branch|stash|diff|historique\s+commit|log\s+git)\b', re.I
)
_STATUS_RE  = re.compile(r'\b(status|[eé]tat|quoi\s+de\s+neuf|modifications?|changements?)\b', re.I)
_DIFF_RE    = re.compile(r'\b(diff|diff[eé]rence|ce\s+qui\s+a\s+chang[eé])\b', re.I)
_LOG_RE     = re.compile(r'\b(log|historique|commits?\s+r[eé]cents?|derniers?\s+commits?)\b', re.I)
_COMMIT_RE  = re.compile(r'\b(commit|valide?|enregistre?)\b', re.I)
_PUSH_RE    = re.compile(r'\b(push|envoie?\s+(?:sur|vers)\s+(?:github|origin)|pousse?)\b', re.I)
_PULL_RE    = re.compile(r'\b(pull|r[eé]cup[eè]re?|met\s+[aà]\s+jour\s+(?:depuis\s+)?(?:github|origin))\b', re.I)
_BRANCH_RE  = re.compile(r'\b(branches?|liste\s+(?:les\s+)?branches?|voir\s+(?:les\s+)?branches?)\b', re.I)
_STASH_RE   = re.compile(r'\b(stash|mets?\s+de\s+c[oô]t[eé]|sauvegarde\s+temp)\b', re.I)
_MSG_RE     = re.compile(r'(?:message|msg|avec\s+(?:le\s+)?message|:\s*)["\']?([^"\']+)["\']?\s*$', re.I)


class GitManager:

    def __init__(self, default_cwd: str = IBRAHIM_DIR) -> None:
        self.cwd = default_cwd

    def _run(self, *args: str, cwd: str | None = None, timeout: int = 30) -> tuple[int, str]:
        try:
            r = subprocess.run(
                ['git', *args],
                cwd=cwd or self.cwd,
                capture_output=True, text=True, timeout=timeout,
                encoding='utf-8', errors='replace',
            )
            out = (r.stdout + r.stderr).strip()
            return r.returncode, out[:800] or '(vide)'
        except subprocess.TimeoutExpired:
            return -1, 'Timeout git (30s)'
        except FileNotFoundError:
            return -1, 'git non installé ou non dans PATH'
        except Exception as e:
            return -1, f'Erreur git: {e}'

    def status(self) -> str:
        code, out = self._run('status', '--short', '-b')
        return f'📊 git status:\n{out}' if code == 0 else f'❌ {out}'

    def diff_stat(self) -> str:
        code, out = self._run('diff', '--stat')
        if code != 0:
            return f'❌ {out}'
        return f'📝 Modifications:\n{out}' if out.strip() else '✅ Aucune modification non-commitée'

    def log(self, n: int = 5) -> str:
        code, out = self._run('log', '--oneline', f'-{n}',
                              '--pretty=format:%h %s (%cr)')
        return f'📜 {n} derniers commits:\n{out}' if code == 0 else f'❌ {out}'

    def add_all(self) -> tuple[int, str]:
        return self._run('add', '-A')

    def commit(self, message: str) -> str:
        code, out = self._run('commit', '-m', message)
        return f'✅ Commit:\n{out}' if code == 0 else f'❌ Commit échoué:\n{out}'

    def push(self, remote: str = 'origin', branch: str = '') -> str:
        args = ['push', remote]
        if branch:
            args.append(branch)
        code, out = self._run(*args, timeout=60)
        return f'✅ Push réussi:\n{out}' if code == 0 else f'❌ Push échoué:\n{out}'

    def pull(self) -> str:
        code, out = self._run('pull', timeout=60)
        return f'✅ Pull OK:\n{out}' if code == 0 else f'❌ Pull échoué:\n{out}'

    def branches(self) -> str:
        code, out = self._run('branch', '-a')
        return f'🌿 Branches:\n{out}' if code == 0 else f'❌ {out}'

    def create_branch(self, name: str) -> str:
        code, out = self._run('checkout', '-b', name)
        return f'✅ Branche créée: {name}\n{out}' if code == 0 else f'❌ {out}'

    def stash(self) -> str:
        code, out = self._run('stash')
        return f'📦 Stash: {out}' if code == 0 else f'❌ {out}'

    def stash_pop(self) -> str:
        code, out = self._run('stash', 'pop')
        return f'📦 Stash restauré: {out}' if code == 0 else f'❌ {out}'

    def full_push(self, message: str = '') -> str:
        """Stage tout + commit + push en une seule commande."""
        self.add_all()
        msg = message or 'auto commit NEXUS'
        c_result = self.commit(msg)
        if '❌' in c_result:
            return c_result
        p_result = self.push()
        return f'{c_result}\n{p_result}'

    def try_handle(self, text: str) -> str | None:
        tl = text.lower().strip()

        if not _GIT_KEYWORDS.search(tl):
            return None

        # commit + push ensemble
        if _PUSH_RE.search(tl) and _COMMIT_RE.search(tl):
            msg_m = _MSG_RE.search(text)
            msg = msg_m.group(1).strip() if msg_m else 'auto commit NEXUS'
            return self.full_push(msg)

        # push seul
        if _PUSH_RE.search(tl):
            return self.push()

        # commit seul
        if _COMMIT_RE.search(tl):
            self.add_all()
            msg_m = _MSG_RE.search(text)
            msg = msg_m.group(1).strip() if msg_m else 'auto commit NEXUS'
            return self.commit(msg)

        if _PULL_RE.search(tl):
            return self.pull()

        if _LOG_RE.search(tl):
            n_m = re.search(r'(\d+)', tl)
            return self.log(int(n_m.group(1)) if n_m else 5)

        if _DIFF_RE.search(tl):
            return self.diff_stat()

        if _BRANCH_RE.search(tl):
            new_m = re.search(r'(?:cr[eé]e?r?|nouvelle?)\s+branche\s+(.+)', tl)
            if new_m:
                return self.create_branch(new_m.group(1).strip())
            return self.branches()

        if _STASH_RE.search(tl):
            if 'pop' in tl or 'restaure' in tl or 'r[eé]cup' in tl:
                return self.stash_pop()
            return self.stash()

        if _STATUS_RE.search(tl):
            return self.status()

        return None
