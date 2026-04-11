#!/usr/bin/env node

// bin/cli.js — CLI entry point for atomic-flow

const HELP = `Usage: atomic-flow <command> [options]

Commands:
  install [--force]           Install atomic-flow in current project
  uninstall                   Remove atomic-flow from current project
  new <name>                  Create a new feature
  status [feature_id]         Show feature status
  gate approve|reject <GN>    Approve or reject a gate
  ui [feature_id]             Open tracking UI in browser
  hook <event>                Internal: run hook handler

Options:
  --help                      Show this help message
`;

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help') {
  if (!command) {
    process.stderr.write(HELP);
    process.exit(1);
  }
  process.stdout.write(HELP);
  process.exit(0);
}

switch (command) {
  case 'install':
    await cmdInstall(args.slice(1));
    break;

  case 'uninstall':
    await cmdUninstall(args.slice(1));
    break;

  case 'new':
    await cmdNew(args.slice(1));
    break;

  case 'status':
    await cmdStatus(args.slice(1));
    break;

  case 'gate':
    await cmdGate(args.slice(1));
    break;

  case 'ui':
    cmdUi(args.slice(1));
    break;

  case 'hook':
    cmdHook(args.slice(1));
    break;

  default:
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// Command handlers
// ═══════════════════════════════════════════════════════════

async function cmdInstall(args) {
  try {
    const { install } = await import('../src/install.js');
    const force = args.includes('--force');
    const result = await install(process.cwd(), { force });

    if (result.installed.length) {
      console.log(`Installed ${result.installed.length} skills:`);
      for (const f of result.installed) console.log(`  + ${f}`);
    }
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} (user-modified):`);
      for (const f of result.skipped) console.log(`  ~ ${f}`);
    }
    if (result.errors.length) {
      console.error(`Errors:`);
      for (const e of result.errors) console.error(`  ! ${e}`);
    }

    console.log(result.success ? '\nInstallation complete.' : '\nInstallation completed with errors.');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function cmdUninstall(args) {
  try {
    const { uninstall } = await import('../src/uninstall.js');
    const result = uninstall(process.cwd());

    if (result.warnings.length) {
      for (const w of result.warnings) console.warn(`Warning: ${w}`);
    }
    if (result.removed.length) {
      console.log(`Removed ${result.removed.length} items:`);
      for (const f of result.removed) console.log(`  - ${f}`);
    }
    if (result.preserved.length) {
      console.log(`Preserved:`);
      for (const f of result.preserved) console.log(`  * ${f}`);
    }

    console.log('\nUninstall complete.');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function cmdNew(args) {
  const name = args.filter(a => !a.startsWith('--')).join(' ').trim();
  if (!name) {
    console.error('Error: Feature name required\n\nUsage: atomic-flow new <name>');
    process.exit(1);
  }

  try {
    const { withDb, createFeature } = await import('../src/db.js');
    const result = await withDb(db => createFeature(db, name));
    console.log(`Feature created:`);
    console.log(`  ID:     ${result.id}`);
    console.log(`  Slug:   ${result.slug}`);
    console.log(`  Branch: ${result.branch}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function cmdStatus(args) {
  const id = args[0] ? parseInt(args[0], 10) : null;

  try {
    const { withDb, getFeature, getAllFeatures, getGates } = await import('../src/db.js');

    if (id) {
      await withDb(db => {
        const feature = getFeature(db, id);
        if (!feature) {
          console.error(`Error: Feature ${id} not found`);
          process.exit(1);
        }
        console.log(`Feature #${feature.id}: ${feature.name}`);
        console.log(`  Status: ${feature.status}`);
        console.log(`  Phase:  ${feature.phase}`);
        console.log(`  Branch: ${feature.branch}`);

        const gates = getGates(db, id);
        if (gates.length) {
          console.log(`  Gates:`);
          for (const g of gates) {
            console.log(`    ${g.gate}: ${g.status}`);
          }
        }
      });
    } else {
      await withDb(db => {
        const features = getAllFeatures(db);
        if (!features.length) {
          console.log('No features found.');
          return;
        }
        console.log('Features:');
        for (const f of features) {
          console.log(`  #${f.id} ${f.name} [${f.status}] (${f.phase})`);
        }
      });
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function cmdGate(args) {
  const subcommand = args[0];

  if (!subcommand || !['approve', 'reject'].includes(subcommand)) {
    console.error('Usage: atomic-flow gate approve|reject <GN> [--id <feature_id>]');
    process.exit(1);
  }

  const gateId = args[1];
  if (!gateId) {
    console.error('Error: Gate ID required (e.g., G1, G2, ..., G7)');
    process.exit(1);
  }

  // Parse --id flag for feature_id
  const idIdx = args.indexOf('--id');
  const featureId = idIdx !== -1 ? parseInt(args[idIdx + 1], 10) : null;

  if (!featureId) {
    console.error('Error: Feature ID required (use --id <feature_id>)');
    process.exit(1);
  }

  try {
    const { withDb } = await import('../src/db.js');
    const { approveGate, rejectGate } = await import('../src/enforcement.js');

    if (subcommand === 'approve') {
      const result = await withDb(async db => {
        return approveGate(db, featureId, gateId, process.cwd());
      });
      console.log(result.message);
    } else {
      // reject — reason from remaining args after gateId (excluding --id and its value)
      const reasonParts = args.slice(2).filter((a, i, arr) => {
        if (a === '--id') return false;
        if (i > 0 && arr[i - 1] === '--id') return false;
        return true;
      });
      const reason = reasonParts.join(' ').trim() || 'No reason provided';

      const result = await withDb(db => {
        return rejectGate(db, featureId, gateId, reason);
      });
      console.log(result.message);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function cmdUi(_args) {
  console.log('UI not yet implemented (planned for T20)');
}

function cmdHook(args) {
  const event = args[0];
  console.log(`Hook "${event || 'unknown'}" not yet implemented (planned for T16)`);
}
