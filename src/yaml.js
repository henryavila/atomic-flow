import yaml from 'js-yaml';

export function parseYaml(content) {
  return yaml.load(content);
}

export function stringifyYaml(obj) {
  return yaml.dump(obj);
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, content };
  }
  return {
    data: yaml.load(match[1]) || {},
    content: match[2],
  };
}
