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

export async function runLean(source: string): Promise<LeanMessage[]> {
  const args = [
    'compose', '-f', COMPOSE_FILE, 'run', '--rm', '-T', 'lean',
    'lake', 'env', 'lean', '--json', '--stdin',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('docker', args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      // Lean exits with a non-zero code when it reports errors, which is normal for us.
      // Docker's own progress lines go to stderr, so stdout only holds Lean's JSON.
      const messages = stdout
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as LeanMessage);
      if (messages.length === 0 && code !== 0) {
        reject(new Error(`Lean did not run (exit code ${code}): ${stderr.trim()}`));
        return;
      }
      resolve(messages);
    });
    child.stdin.end(source);
  });
}
