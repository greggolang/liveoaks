export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev'
export const APP_SHA = (import.meta.env.VITE_APP_SHA as string || '').slice(0, 7)
