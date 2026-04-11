// Atomic Flow — Public API
// Barrel export for @henryavila/atomic-flow

export {
  resolveMainRepo, getDbPath,
  openDb, saveDb, withDb,
  createFeature, getFeature, getFeatureByBranch, getAllFeatures,
  setFeaturePhase, setFeatureSpecHash, cancelFeature,
  getGates, setGateStatus,
  createTask, getTasks, getCurrentTask,
  setTaskStatus, incrementStrikes, setTaskCommit,
  addLearning, getLearnings,
  getFeatureStats,
} from './db.js';

export {
  transition, approveGate, rejectGate,
  runPreflight, reconcile,
} from './enforcement.js';

export {
  computeHash, extractSpecSections,
  computeSpecHash, computeFileHash, truncateHash,
} from './hash.js';

export { acquireLock, releaseLock, withLock } from './lock.js';
export { parseYaml, stringifyYaml, parseFrontmatter } from './yaml.js';
export { IDE_REGISTRY, TEMPLATE_VARS, getConfig, getTemplateVars } from './config.js';
