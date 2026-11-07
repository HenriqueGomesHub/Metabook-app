import type { Round } from '@metabook/core';
import type { ChangeEvent } from 'react';
import { mapAnalyzerRounds } from './roundAnalyzer';

const readText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });

/** A file picker styled as a ghost button; reports a message or an error per file. */
export function ImportRounds({
  onImport,
  onResult,
}: {
  onImport(rounds: Round[]): number;
  onResult(result: { message: string; ok: boolean }): void;
}) {
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { rounds, skipped } = mapAnalyzerRounds(JSON.parse(await readText(file)));
      const added = onImport(rounds);
      const known = rounds.length - added;
      onResult({
        ok: true,
        message:
          `Imported ${added} ${added === 1 ? 'round' : 'rounds'}, skipped ${skipped} without country codes` +
          (known > 0 ? `, ${known} already logged` : ''),
      });
    } catch (reason) {
      onResult({
        ok: false,
        message:
          reason instanceof SyntaxError
            ? 'That file is not valid JSON.'
            : String(reason instanceof Error ? reason.message : reason),
      });
    }
    input.value = '';
  }

  return (
    <label className="ghost file">
      Import
      <input type="file" accept=".json,application/json" onChange={pick} />
    </label>
  );
}
