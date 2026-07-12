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
  email?: string
  message?: string
  submittedAt?: string
  ip?: string
  country?: string
  region?: string
  city?: string
}

const Email = ({ name, email, message, submittedAt, ip, country, region, city }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New feedback from ${name ?? 'a SongIQ user'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New SongIQ Feedback</Heading>
        <Text style={muted}>Someone just submitted the in-app feedback form.</Text>

        <Section style={card}>
          <Text style={label}>Name</Text>
          <Text style={value}>{name || '—'}</Text>

          <Hr style={hr} />

          <Text style={label}>Email</Text>
          <Text style={value}>{email || '—'}</Text>

          <Hr style={hr} />

          <Text style={label}>Message</Text>
          <Text style={{ ...value, whiteSpace: 'pre-wrap' }}>{message || '—'}</Text>

          {(ip || country || region || city) && (
            <>
              <Hr style={hr} />
              <Text style={label}>IP address</Text>
              <Text style={value}>{ip || '—'}</Text>
              <Hr style={hr} />
              <Text style={label}>Location</Text>
              <Text style={value}>
                {[city, region, country].filter(Boolean).join(', ') || '—'}
              </Text>
            </>
          )}

          {submittedAt && (
            <>
              <Hr style={hr} />
              <Text style={label}>Submitted</Text>
              <Text style={value}>{submittedAt}</Text>
            </>
          )}
        </Section>

        <Text style={footer}>SongIQ · feedback notifications</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Props) => `New SongIQ feedback from ${data?.name || 'a user'}`,
  displayName: 'Feedback notification',
  to: 'daniel@devcrib.io',
  previewData: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'Love the game! Would be great to have a Highlife playlist.',
    submittedAt: new Date().toISOString(),
    ip: '203.0.113.42',
    country: 'Nigeria',
    region: 'Lagos',
    city: 'Lagos',
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
