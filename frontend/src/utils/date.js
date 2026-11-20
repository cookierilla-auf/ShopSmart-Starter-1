export const formatDate = (value) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
