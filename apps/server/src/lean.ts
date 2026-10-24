/**
 * Runs Lean on a source file and returns its messages.
 *
 * Lean lives in the Docker image, so we start a throw-away container, send the source on
 * standard input and read one JSON message per line from standard output.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { LeanMessage } from './verdict.ts';

const COMPOSE_FILE = fileURLToPath(new URL('../../../docker/compose.yaml', import.meta.url));

/** The longest Lean may spend on one file. */
export const TIME_LIMIT_SECONDS = 15;

/** Extra time for Docker to start and remove the container, on top of `TIME_LIMIT_SECONDS`. */
const DOCKER_GRACE_SECONDS = 45;

/** Exit codes of `timeout` when it stopped Lean: 124, or 137 if Lean had to be killed. */
const TIMED_OUT = new Set([124, 137]);

export class LeanTimeout extends Error {
  constructor() {
    super(`Lean took longer than ${TIME_LIMIT_SECONDS} seconds`);
    this.name = 'LeanTimeout';
  }
}

/** Turns what the container printed into Lean's messages, or throws to say why there are none. */
export function readOutput(code: number | null, stdout: string, stderr: string): LeanMessage[] {
  if (code !== null && TIMED_OUT.has(code)) throw new LeanTimeout();

  // Lean exits with a non-zero code when it reports errors, which is normal for us.
  // Docker's own progress lines go to stderr, so stdout only holds Lean's JSON.
  const messages: LeanMessage[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    try {
      messages.push(JSON.parse(line) as LeanMessage);
    } catch {
      throw new Error(`Lean printed a line that isn't JSON: ${line.slice(0, 200)}`);
    }
  }
  if (messages.length === 0 && code !== 0) {
    throw new Error(`Lean did not run (exit code ${code}): ${stderr.trim()}`);
  }
  return messages;
}

export async function runLean(source: string): Promise<LeanMessage[]> {
  const args = [
    'compose', '-f', COMPOSE_FILE, 'run', '--rm', '-T', 'lean',
    // The time limit runs inside the container: stopping the docker client alone can leave
    // the container, and Lean in it, running.
    'timeout', '--kill-after=2', String(TIME_LIMIT_SECONDS),
    'lake', 'env', 'lean', '--json', '--stdin',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('docker', args);
    let stdout = '';
    let stderr = '';

    // In case Docker itself hangs and the limit inside the container never fires.
    const backstop = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new LeanTimeout());
    }, (TIME_LIMIT_SECONDS + DOCKER_GRACE_SECONDS) * 1000);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(backstop);
      reject(err.code === 'ENOENT' ? new Error('Docker is not installed, or `docker` is not on the PATH') : err);
    });
    // If the process dies before reading the source, writing it fails. 'close' says why.
    child.stdin.on('error', () => {});
    child.on('close', (code) => {
      clearTimeout(backstop);
      try {
        resolve(readOutput(code, stdout, stderr));
      } catch (err) {
        reject(err);
      }
    });
    child.stdin.end(source);
  });
}
