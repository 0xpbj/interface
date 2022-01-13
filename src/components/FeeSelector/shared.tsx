import { Trans } from '@lingui/macro'
import { FeeAmount } from '@uniswap/v3-sdk'
import { ALL_SUPPORTED_CHAIN_IDS, SupportedChainId } from 'constants/chains'
import { ReactNode } from 'react'

export const FEE_AMOUNT_DETAIL: Record<
  FeeAmount,
  { label: string; description: ReactNode; supportedChains: SupportedChainId[] }
> = {
  [FeeAmount.LOWEST]: {
    label: '100',
    description: <Trans>Best for small trades.</Trans>,
    supportedChains: [SupportedChainId.MAINNET],
  },
  [FeeAmount.LOW]: {
    label: '1000',
    description: <Trans>Best for med trades.</Trans>,
    supportedChains: ALL_SUPPORTED_CHAIN_IDS,
  },
  [FeeAmount.MEDIUM]: {
    label: '10000',
    description: <Trans>Best for large trades.</Trans>,
    supportedChains: ALL_SUPPORTED_CHAIN_IDS,
  },
  [FeeAmount.HIGH]: {
    label: 'Automatic',
    description: <Trans>Best for Prabhaav &amp; you</Trans>,
    supportedChains: ALL_SUPPORTED_CHAIN_IDS,
  },
}
