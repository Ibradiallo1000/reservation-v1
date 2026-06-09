export function resolveAgencyDisplayName(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (name && name.toLocaleLowerCase('fr') !== 'agence') return name;
  }
  return '';
}
