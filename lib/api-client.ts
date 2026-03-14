const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');
const DEFAULT_DEV_API_BASE = 'http://localhost:3000';
const DEFAULT_PROD_API_BASE = 'https://proctor-phi.vercel.app';

const configuredBase = process.env.NEXT_PUBLIC_API_BASE?.trim() ?? '';

const getDefaultApiBase = () =>
  process.env.NODE_ENV === 'development' ? DEFAULT_DEV_API_BASE : DEFAULT_PROD_API_BASE;

export const getApiBase = () => normalizeBaseUrl(configuredBase || getDefaultApiBase());

export const apiUrl = (path: string) => {
  const base = getApiBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};
