import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export interface PcCommand {
  action: string;
  params: Record<string, unknown>;
}

export interface PcResult {
  success: boolean;
  data?:   unknown;
  error?:  string;
  message: string;
}

export async function executeLocalCommand(cmd: PcCommand): Promise<PcResult> {
  try {
    switch (cmd.action) {
      case 'pc_run_command':
        return runCommand(cmd.params);
      case 'pc_open_file':
        return openFile(cmd.params);
      case 'pc_screenshot':
        return takeScreenshot(cmd.params);
      case 'pc_list_files':
        return listFiles(cmd.params);
      case 'pc_read_file':
        return readFile(cmd.params);
      default:
        return { success: false, error: 'Unknown command', message: `Commande PC inconnue: ${cmd.action}` };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error, message: `Erreur PC: ${error}` };
  }
}

async function runCommand(params: Record<string, unknown>): Promise<PcResult> {
  const { command, cwd } = params as { command: string; cwd?: string };
  if (!command) return { success: false, error: 'missing_command', message: 'Commande requise' };

  const BLOCKED = ['rm -rf', 'del /f', 'format', 'shutdown', 'reboot', 'mkfs'];
  if (BLOCKED.some(b => command.toLowerCase().includes(b))) {
    return { success: false, error: 'blocked', message: 'Commande bloquée pour des raisons de sécurité.' };
  }

  const { stdout, stderr } = await execAsync(command, {
    cwd:     cwd as string | undefined,
    timeout: 30_000,
  });

  return {
    success: true,
    data:    { stdout, stderr },
    message: `✅ Commande exécutée. ${stdout.slice(0, 200)}`,
  };
}

async function openFile(params: Record<string, unknown>): Promise<PcResult> {
  const { filePath } = params as { filePath: string };
  if (!filePath) return { success: false, error: 'missing_path', message: 'Chemin requis' };

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, error: 'not_found', message: `Fichier introuvable: ${resolved}` };
  }

  const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  execSync(`${opener} "${resolved}"`);

  return { success: true, message: `✅ Fichier ouvert: ${path.basename(resolved)}` };
}

async function takeScreenshot(params: Record<string, unknown>): Promise<PcResult> {
  const { outputPath = `./screenshot-${Date.now()}.png` } = params as { outputPath?: string };

  if (process.platform === 'win32') {
    const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bmp.Save("${outputPath}") }`;
    await execAsync(`powershell -Command "${script}"`);
  } else {
    await execAsync(`scrot "${outputPath}" 2>/dev/null || screencapture "${outputPath}"`);
  }

  return {
    success: true,
    data:    { path: outputPath },
    message: `✅ Capture d'écran enregistrée: ${outputPath}`,
  };
}

async function listFiles(params: Record<string, unknown>): Promise<PcResult> {
  const { directory = '.', pattern } = params as { directory?: string; pattern?: string };
  const resolved = path.resolve(directory);

  if (!fs.existsSync(resolved)) {
    return { success: false, error: 'not_found', message: `Dossier introuvable: ${resolved}` };
  }

  const files = fs.readdirSync(resolved, { withFileTypes: true }).map(f => ({
    name:  f.name,
    type:  f.isDirectory() ? 'directory' : 'file',
    path:  path.join(resolved, f.name),
  }));

  const filtered = pattern
    ? files.filter(f => f.name.includes(pattern))
    : files;

  return { success: true, data: filtered, message: `${filtered.length} fichier(s) trouvé(s)` };
}

async function readFile(params: Record<string, unknown>): Promise<PcResult> {
  const { filePath, encoding = 'utf-8' } = params as { filePath: string; encoding?: BufferEncoding };
  if (!filePath) return { success: false, error: 'missing_path', message: 'Chemin requis' };

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, error: 'not_found', message: `Fichier introuvable: ${resolved}` };
  }

  const content = fs.readFileSync(resolved, encoding);
  return {
    success: true,
    data:    { content, path: resolved },
    message: `✅ Fichier lu: ${path.basename(resolved)}`,
  };
}
