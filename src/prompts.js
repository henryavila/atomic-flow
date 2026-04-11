// src/prompts.js — Thin wrapper around inquirer for interactive prompts

import { createRequire } from 'node:module';

export async function confirm(message) {
  const { default: inquirer } = await import('inquirer');
  const { answer } = await inquirer.prompt([{
    type: 'confirm',
    name: 'answer',
    message,
    default: false
  }]);
  return answer;
}
