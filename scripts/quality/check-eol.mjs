import { execFileSync } from 'node:child_process';

const output = execFileSync('git', ['ls-files', '--eol', '-z'], {
  encoding: 'buffer',
});

const records = output
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const invalid = records
  .map((record) => {
    const tab = record.indexOf('\t');
    return {
      metadata: tab === -1 ? record : record.slice(0, tab),
      path: tab === -1 ? '' : record.slice(tab + 1),
    };
  })
  .filter(({ metadata }) => /\bi\/(?:crlf|mixed)\b/.test(metadata));

if (invalid.length > 0) {
  console.error('Tracked blobs with non-canonical EOL:');
  for (const { metadata, path } of invalid) {
    console.error(`- ${path} (${metadata.trim()})`);
  }
  process.exitCode = 1;
} else {
  console.log(`EOL audit passed: ${records.length} tracked blobs have canonical index EOL.`);
}
