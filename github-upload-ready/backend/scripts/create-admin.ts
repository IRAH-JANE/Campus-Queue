import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

function verifyLocalTestDatabase(connectionString: string | undefined): URL {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Set it to the local test database first.');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection URL.');
  }

  const hostname = url.hostname.toLowerCase();
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const localHost = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !localHost ||
    url.port !== '5433' ||
    database !== 'campus_queue_test'
  ) {
    throw new Error(
      'Refusing to provision an admin: this command only runs against the local Docker database campus_queue_test on port 5433.',
    );
  }

  return url;
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY) {
    throw new Error('Run this command from an interactive terminal so the password can be hidden.');
  }

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  (rl as unknown as { _writeToOutput: (value: string) => void })._writeToOutput = () => {};
  stdout.write(question);
  try {
    const answer = await rl.question('');
    stdout.write('\n');
    return answer;
  } finally {
    rl.close();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const parsedDatabaseUrl = verifyLocalTestDatabase(databaseUrl);
  const confirmedDatabase = await ask(
    `This will create an ADMIN in local ${decodeURIComponent(parsedDatabaseUrl.pathname.slice(1))}. Type CREATE ADMIN to continue: `,
  );

  if (confirmedDatabase !== 'CREATE ADMIN') {
    throw new Error('Confirmation did not match. No account was created.');
  }

  const fullName = await ask('Admin full name: ');
  const email = (await ask('Admin email: ')).toLowerCase();

  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a full name and a valid email address.');
  }

  const password = await askHidden('Admin password (at least 12 characters; input hidden): ');
  const confirmation = await askHidden('Confirm admin password: ');
  if (password.length < 12 || password !== confirmation) {
    throw new Error('Passwords must match and contain at least 12 characters. No account was created.');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl! });
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new Error('That email already belongs to an account. This command never changes existing roles.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { fullName, email, password: passwordHash, role: Role.ADMIN },
      select: { id: true, fullName: true, email: true, role: true },
    });

    console.log(`Created ${user.role} account for ${user.email}. The password was not displayed or saved by this command.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected provisioning error.';
  console.error(message);
  process.exitCode = 1;
});
