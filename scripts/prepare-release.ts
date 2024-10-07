import { execSync } from 'child_process';
import * as fs from 'fs';

function getModifiedFiles(): string[] {
  const output = execSync('git status --porcelain').toString();
  return output
    .split('\n')
    .filter(line => line.trim().endsWith('CHANGELOG.md'))
    .map(line => line.trim().split(' ').pop() as string);
}

/**
 * Retrieves the latest changelog entry from a given changelog file, prefixed with the package name.
 *
 * @param {string} filePath - The path to the changelog file.
 * @returns {string} - The latest changelog entry.
 * @throws {Error} - Throws an error if the package name is not found in the changelog file.
 */
function getLatestChangelogEntry(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const startIndex = lines.findIndex(line => line.startsWith('## '));
  if (startIndex === -1) return '';

  const endIndex = lines
    .slice(startIndex + 1)
    .findIndex(line => line.startsWith('## '));
  const entryLines = lines.slice(
    startIndex,
    endIndex === -1 ? undefined : startIndex + endIndex + 1,
  );

  const packageNameLine = lines.find(line => line.startsWith('# '));
  if (!packageNameLine) {
    throw new Error(`Package name not found in ${filePath}`);
  }
  const packageName = packageNameLine.replace('# ', '').trim();

  return entryLines.join('\n').replace(/^##\s/, `## ${packageName}@`);
}

/**
 * Reads current release version from package.json.
 */
function getCurrentReleaseVersion(): string {
  const packageJsonPath = './package.json';
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found');
  }

  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);

  if (!packageJson.version) {
    throw new Error('Version not found in package.json');
  }

  return packageJson.version;
}

/**
 * Updates the version in the package.json file to the specified new version.
 *
 * @param newVersion - The new version to be written to the package.json file.
 * @throws Will throw an error if the package.json file is not found.
 */
function writeNewReleaseVersion(newVersion: string): void {
  const packageJsonPath = './package.json';
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found');
  }

  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);

  packageJson.version = newVersion;

  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2),
    'utf-8',
  );
}

/**
 * Generates the next release version based on the current version and the specified type of version change.
 *
 * @param currentVersion - The current version string.
 * @param versionNumber - The type of version change: 'major', 'minor', or 'patch'.
 * @returns The next version string.
 * @throws Will throw an error if the provided type of version change is invalid.
 */
function generateNextReleaseVersion(
  currentVersion: string,
  versionNumber: 'major' | 'minor' | 'patch',
): string {
  const [major, minor, patch] = currentVersion.split('.').map(Number);

  switch (versionNumber) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error('Was not able to determine next release version');
  }
}

/**
 * Updates the "Unreleased" section in the CHANGELOG.md file by adding a link to the release notes.
 *
 * @param releaseNotesPath - The path to the file with release notes.
 * @throws Will throw an error if the CHANGELOG.md file is not found.
 * @throws Will throw an error if the "Unreleased" section is not found in the CHANGELOG.md file.
 */
function updateUnreleasedSection(releaseNotesPath: string): void {
  const changelogPath = './CHANGELOG.md';
  if (!fs.existsSync(changelogPath)) {
    throw new Error('CHANGELOG.md not found');
  }

  const content = fs.readFileSync(changelogPath, 'utf-8');
  const lines = content.split('\n');
  const unreleasedIndex = lines.findIndex(line =>
    line.startsWith('## [Unreleased]'),
  );

  if (unreleasedIndex === -1) {
    throw new Error('Unreleased section not found in CHANGELOG.md');
  }

  const releaseNotesLink = `\nSee [${releaseNotesPath}](${releaseNotesPath}) for more information.`;
  if (!lines.includes(releaseNotesLink)) {
    lines.splice(unreleasedIndex + 1, 0, releaseNotesLink);
    fs.writeFileSync(changelogPath, lines.join('\n'), 'utf-8');
  }
}

/**
 * Determines the type of version change based on the provided release notes.
 *
 * @param releaseNotes - The release notes containing information about the changes.
 * @returns The type of version change: 'major', 'minor', or 'patch'.
 * @throws Will throw an error if the version number cannot be determined from the release notes.
 */
function getNextVersionNumber(
  releaseNotes: string,
): 'major' | 'minor' | 'patch' {
  if (releaseNotes.includes('### Major Changes')) {
    return 'major';
  } else if (releaseNotes.includes('### Minor Changes')) {
    return 'minor';
  } else if (releaseNotes.includes('### Patch Changes')) {
    return 'patch';
  }

  throw new Error(`Was not able to determine version number from releaseNotes`);
}

/**
 * This function identifies the changelog files that have been modified or created,
 * extracts the latest changelog entry from each of these files,
 * and then combines these entries into a single string.
 *
 * @returns {string} A string containing the combined changelog entries.
 */
function getCombinedReleaseNotes(): string {
  const modifiedFiles = getModifiedFiles();
  const changelogEntries = modifiedFiles
    .map(getLatestChangelogEntry)
    .filter(entry => entry !== '');

  return changelogEntries.join('\n\n');
}

/**
 * Writes the release notes to a markdown file in the `./docs/releases/` directory.
 *
 * @param version - The version number of the release.
 * @param releaseNotes - The release notes content to be written to the file.
 * @returns The file path where the release notes were written.
 */
function writeReleaseNotes(version: string, releaseNotes: string): string {
  const releaseDir = './docs/releases';
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }

  const releaseDocPath = `${releaseDir}/v${version}-changelog.md`;
  const releaseNotesHeader = `# Release v${version}\n\n`;
  fs.writeFileSync(releaseDocPath, releaseNotesHeader + releaseNotes, 'utf-8');

  return releaseDocPath;
}

/**
 * Reads and validates the user input from the command line arguments.
 *
 * @returns {Object} An object with validated user input arguments.
 * @throws {Error} If user input is invalid.
 */
function readUserInput(): {
  versionNumber?: 'major' | 'minor' | 'patch';
  version?: string;
} {
  let versionNumber;
  let version;
  if (process.argv[2]) {
    if (['major', 'minor', 'patch'].includes(process.argv[2])) {
      versionNumber = process.argv[2] as 'major' | 'minor' | 'patch';
    } else if (/^\d+\.\d+\.\d+$/.test(process.argv[2])) {
      version = process.argv[2] as string;
    } else {
      throw new Error(
        `Invalid argument provided: ${process.argv[2]}. Must be one of 'major', 'minor', 'patch' or must match pattern like '1.2.3'`,
      );
    }
  }

  return {
    versionNumber,
    version,
  };
}

/**
 * Reads and validates the environment variables.
 *
 * @returns {Object} An object with validated environment variables.
 */
function readEnvVariables(): {
  versionNumber?: 'major' | 'minor' | 'patch';
  version?: string;
} {
  let versionNumber;

  if (
    process.env.RELEASE_VERSION_NUMBER &&
    ['major', 'minor', 'patch'].includes(process.env.RELEASE_VERSION_NUMBER)
  ) {
    versionNumber = process.env.RELEASE_VERSION_NUMBER as
      | 'major'
      | 'minor'
      | 'patch';
  }

  let version;
  if (
    process.env.RELEASE_VERSION &&
    /^\d+\.\d+\.\d+$/.test(process.env.RELEASE_VERSION)
  ) {
    version = process.env.RELEASE_VERSION;
  }

  return {
    versionNumber,
    version,
  };
}

async function main() {
  const { versionNumber: versionNumberFromUser, version: versionFromUser } =
    readUserInput();
  const { versionNumber: versionNumberFromEnv, version: versionFromEnv } =
    readEnvVariables();
  const versionNumber = versionNumberFromUser || versionNumberFromEnv;
  const version = versionFromUser || versionFromEnv;

  const releaseNotes = getCombinedReleaseNotes();

  let nextVersion: string;
  if (version) {
    nextVersion = version;
  } else {
    const nextVersionNumber =
      versionNumber || getNextVersionNumber(releaseNotes);
    console.log(`Preparing ${nextVersionNumber.toUpperCase()} release...`);

    const currentVersion = getCurrentReleaseVersion();
    nextVersion = generateNextReleaseVersion(currentVersion, nextVersionNumber);
  }
  console.log(`Preparing "${nextVersion}" release...`);

  const releaseNotesPath = writeReleaseNotes(nextVersion, releaseNotes);
  console.log('Release notes written to', releaseNotesPath);

  updateUnreleasedSection(releaseNotesPath);
  console.log('CHANGELOG.md updated');

  writeNewReleaseVersion(nextVersion);
  console.log('Version in package.json updated');

  console.log('Release prepared successfully');
}

main().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
