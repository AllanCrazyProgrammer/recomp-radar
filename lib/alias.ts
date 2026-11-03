export class SocialError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function normalizeAlias(value: unknown) {
  if (typeof value !== 'string') throw new SocialError('Elige un alias de 3 a 24 caracteres.');
  const alias = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(alias)) {
    throw new SocialError('Usa 3–24 letras, números o guion bajo; comienza con letra o número.');
  }
  return alias;
}
