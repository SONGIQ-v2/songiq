import type { ComponentType } from 'npm:react@18.3.1'
import { template as feedbackNotification } from './feedback-notification.tsx'
import { template as newSignupNotification } from './new-signup-notification.tsx'
import { template as unsubscribeNotification } from './unsubscribe-notification.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string | ((data: any) => string)
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'feedback-notification': feedbackNotification,
  'new-signup-notification': newSignupNotification,
  'unsubscribe-notification': unsubscribeNotification,
}
