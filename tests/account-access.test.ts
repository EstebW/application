import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  accountCanRevealTwin,
  accountCanSkipTwinUnlock,
  type AccountData,
} from '../lib/account.ts'

function baseAccount(overrides: Partial<AccountData> = {}): AccountData {
  return {
    sessionId: 's1',
    email: 'a@b.c',
    firstName: 'A',
    creditsBalance: 0,
    subscriptionPlan: null,
    subscriptionExpiresAt: null,
    analyses: [],
    generations: [],
    transactions: [],
    ...overrides,
  }
}

describe('accès compte jumeau', () => {
  it('skip teaser avec crédits', () => {
    assert.equal(accountCanSkipTwinUnlock(baseAccount({ creditsBalance: 3 })), true)
    assert.equal(accountCanRevealTwin(baseAccount({ creditsBalance: 3 })), true)
  })

  it('skip teaser avec historique d\'achat', () => {
    const account = baseAccount({
      transactions: [{ id: '1', amount: 10, reason: 'purchase', created_at: '' }],
    })
    assert.equal(accountCanSkipTwinUnlock(account), true)
    assert.equal(accountCanRevealTwin(account), false)
  })

  it('teaser obligatoire pour nouveau visiteur', () => {
    assert.equal(accountCanSkipTwinUnlock(baseAccount()), false)
    assert.equal(accountCanRevealTwin(baseAccount()), false)
  })

  it('accès illimité bypass tout', () => {
    const account = baseAccount({ hasUnlimitedAccess: true })
    assert.equal(accountCanSkipTwinUnlock(account), true)
    assert.equal(accountCanRevealTwin(account), true)
  })
})
