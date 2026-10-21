/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WHATSAPP_NUMBER: string
  readonly VITE_STORE_ADDRESS?: string
  readonly VITE_INSTAGRAM_URL?: string
  readonly VITE_FACEBOOK_URL?: string
  readonly VITE_TIKTOK_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
