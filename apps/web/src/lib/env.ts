// `process.env.NEXT_PUBLIC_*` must be referenced literally for Next to inline the values at build time.
// Getters defer the check to first use, so building without a .env (e.g. in CI) still works.
export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey() {
    return required('SUPABASE_PUBLISHABLE_KEY', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  },
  get apiUrl() {
    return required('API_URL', process.env.NEXT_PUBLIC_API_URL);
  },
};

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set in the root .env file. Run \`pnpm bootstrap\` first.`);
  }
  return value;
}
