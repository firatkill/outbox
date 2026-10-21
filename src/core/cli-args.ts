import { parseOutboxConfig } from './config.js';

/** Options consumed by node:util parseArgs in the executable. */
export const CLI_OPTIONS = {
  url: { type: 'string' },
  schema: { type: 'string' },
  prefix: { type: 'string' },
  driver: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  'dry-run': { type: 'boolean' },
  status: { type: 'boolean' },
  check: { type: 'boolean' },
  print: { type: 'boolean' },
  from: { type: 'string' },
  json: { type: 'boolean' },
} as const;

/** Command-line usage. */
export const CLI_HELP = `Usage: outbox <command> [options]

Commands:
  migrate            Apply pending migrations
  stats              Print queue statistics

Options (all commands):
  --url <url>        Connection string (default: $DATABASE_URL)
  --schema <name>    Schema (default: public)
  --prefix <prefix>  Table prefix (default: outbox_)
  --driver <name>    postgres-js | pg (default: first installed of postgres, pg)
  -h, --help
  -v, --version

migrate options:
  --dry-run          Print the SQL that would run; change nothing
  --status           Print applied and pending versions
  --check            With --status: exit 3 when migrations are pending
  --print            Print migrationSql() and exit (no connection)
  --from <n>         With --print: start after version n (default 0)

stats options:
  --json             Machine-readable output
`;

/** Normalized executable options. */
export interface CliArgs {
  command: 'help' | 'version' | 'migrate' | 'stats';
  url: string | undefined;
  schema: string;
  tablePrefix: string;
  driver: 'postgres-js' | 'pg' | undefined;
  dryRun: boolean;
  status: boolean;
  check: boolean;
  print: boolean;
  fromVersion: number;
  json: boolean;
}

/** Validate the parsed command and resolve documented defaults.
 * @example
 * resolveCliArgs({ print: true }, ['migrate']);
 */
export function resolveCliArgs(
  values: Record<string, string | boolean | undefined>,
  positionals: string[],
  databaseUrl?: string,
): CliArgs {
  const requested =
    values['help'] === true ? 'help' : values['version'] === true ? 'version' : (positionals[0] ?? 'help');
  if (!['help', 'version', 'migrate', 'stats'].includes(requested) || positionals.length > 1)
    throw new Error('Unknown command. Run outbox --help.');
  const command = requested as CliArgs['command'];
  const string = (name: string): string | undefined => (typeof values[name] === 'string' ? values[name] : undefined);
  const driver = string('driver');
  if (driver !== undefined && driver !== 'postgres-js' && driver !== 'pg')
    throw new Error('driver must be postgres-js or pg');
  const config = parseOutboxConfig({ db: {}, schema: string('schema'), tablePrefix: string('prefix') });
  const fromVersion = Number(string('from') ?? 0);
  if (!Number.isSafeInteger(fromVersion) || fromVersion < 0) throw new Error('--from must be a non-negative integer');
  if (values['check'] === true && values['status'] !== true) throw new Error('--check requires --status');
  if (values['from'] !== undefined && values['print'] !== true) throw new Error('--from requires --print');
  const url = string('url') ?? databaseUrl;
  if ((command === 'migrate' || command === 'stats') && values['print'] !== true && !url)
    throw new Error('Missing URL: pass --url or set DATABASE_URL');
  return {
    command,
    url,
    schema: config.schema,
    tablePrefix: config.tablePrefix,
    driver,
    dryRun: values['dry-run'] === true,
    status: values['status'] === true,
    check: values['check'] === true,
    print: values['print'] === true,
    fromVersion,
    json: values['json'] === true,
  };
}

/** Remove URL passwords from diagnostic text, including a known connection URL's password.
 * @example
 * redactPassword('postgres://u:secret@h/db'); // 'postgres://u:***@h/db'
 */
export function redactPassword(text: string, connectionUrl?: string): string {
  let result = text.replace(/(postgres(?:ql)?:\/\/[^\s/:@]+:)[^\s@]*@/gi, '$1***@');
  if (connectionUrl !== undefined) {
    try {
      const encoded = new URL(connectionUrl).password;
      if (encoded.length > 0) {
        result = result.replaceAll(encoded, '***');
        const decoded = decodeURIComponent(encoded);
        if (decoded.length > 0) result = result.replaceAll(decoded, '***');
      }
    } catch {
      /* A malformed URL is still redacted by the text rule above. */
    }
  }
  return result;
}
