const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
const numbers = new Intl.NumberFormat('en');

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatNumber = (value: number) => numbers.format(value);
