"""
NEXUS Claude Code Manager
- launch(): open Claude Code in Windows Terminal, --dangerously-skip-permissions
- run_task(): run a prompt non-interactively, return output
"""
import asyncio
import logging
import os
from pathlib import Path

log = logging.getLogger('nexus.claude')

IBRAHIM_DIR = str(Path.home() / 'OneDrive' / 'Bureau' / 'ibrahim' / 'ibrahim')


class ClaudeCodeManager:
    async def launch(
        self,
        prompt: str = '',
        cwd: str = IBRAHIM_DIR,
        auto_accept: bool = True,
    ) -> str:
        """Open Claude Code in a terminal window."""
        base_cmd = ['claude']
        if auto_accept:
            base_cmd.append('--dangerously-skip-permissions')
        if prompt:
            base_cmd += ['-p', prompt]

        cmd_str = ' '.join(base_cmd)

        # Windows Terminal (preferred)
        try:
            import subprocess
            subprocess.Popen(
                ['wt.exe', '-d', cwd, 'cmd', '/k', cmd_str],
                shell=False,
            )
            log.info('Claude Code launched in Windows Terminal: %s', cmd_str)
            return '✅ Claude Code lancé dans Windows Terminal (auto-accept activé)'
        except FileNotFoundError:
            pass

        # Fallback: plain cmd
        try:
            import subprocess
            subprocess.Popen(['cmd.exe', '/k', cmd_str], cwd=cwd, shell=False)
            log.info('Claude Code launched in cmd: %s', cmd_str)
            return '✅ Claude Code lancé (cmd)'
        except Exception as e:
            return f'Erreur Claude Code: {e}'

    async def run_task(self, prompt: str, cwd: str = IBRAHIM_DIR) -> str:
        """Run a prompt non-interactively, return last 1000 chars of output."""
        try:
            proc = await asyncio.create_subprocess_exec(
                'claude', '-p', prompt, '--dangerously-skip-permissions',
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=180)
                output = (stdout or b'').decode('utf-8', errors='replace')
                return output[-1000:] if len(output) > 1000 else output
            except asyncio.TimeoutError:
                proc.terminate()
                return 'Timeout — tâche trop longue (>3 min)'
        except Exception as e:
            return f'Erreur: {e}'
