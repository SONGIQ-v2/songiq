/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  nickname?: string
  email?: string
  unsubscribedAt?: string
  totalUnsubscribed?: number | string
}

const Email = ({ name, nickname, email, unsubscribedAt, totalUnsubscribed }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Unsubscribed from daily reminders: ${email ?? 'a player'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Daily Reminder Unsubscribe</Heading>
        <Text style={muted}>A player opted out of the daily reminder emails.</Text>

        <Section style={card}>
          <Text style={label}>Name</Text>
          <Text style={value}>{name || '—'}</Text>

          <Hr style={hr} />

          <Text style={label}>Nickname</Text>
          <Text style={value}>{nickname || '—'}</Text>

          <Hr style={hr} />

          <Text style={label}>Email</Text>
          <Text style={value}>{email || '—'}</Text>

          {unsubscribedAt && (
            <>
              <Hr style={hr} />
              <Text style={label}>When</Text>
              <Text style={value}>{unsubscribedAt}</Text>
            </>
          )}

          {totalUnsubscribed !== undefined && totalUnsubscribed !== null && totalUnsubscribed !== '' && (
            <>
              <Hr style={hr} />
              <Text style={label}>Total unsubscribed</Text>
              <Text style={value}>{String(totalUnsubscribed)}</Text>
            </>
          )}
        </Section>

        <Text style={footer}>SongIQ · email notifications</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Props) => `Unsubscribed from daily reminders: ${data?.nickname || data?.name || data?.email || 'a player'}`,
  displayName: 'Daily reminder unsubscribe notification',
  to: 'daniel@devcrib.io',
  previewData: {
    name: 'Jane Doe',
    nickname: 'janedoe',
    email: 'jane@example.com',
    unsubscribedAt: new Date().toISOString(),
    totalUnsubscribed: 3,
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  color: '#0f172a',
}
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 700, margin: '0 0 8px', color: '#0f172a' }
const muted = { color: '#64748b', fontSize: '14px', margin: '0 0 20px' }
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '20px',
}
const label = { fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#64748b', margin: '0 0 4px' }
const value = { fontSize: '15px', color: '#0f172a', margin: '0 0 4px', lineHeight: '1.5' }
const hr = { borderColor: '#e2e8f0', margin: '14px 0' }
const footer = { color: '#94a3b8', fontSize: '12px', textAlign: 'center' as const, marginTop: '20px' }
