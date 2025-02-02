import { Trans } from '@lingui/macro'
import { FeeAmount } from '@uniswap/v3-sdk'
import { ButtonRadioChecked } from 'components/Button'
import { AutoColumn } from 'components/Column'
import { useFeeTierDistribution } from 'hooks/useFeeTierDistribution'
import { PoolState } from 'hooks/usePools'
import React from 'react'
import styled from 'styled-components/macro'
import { ThemedText } from 'theme'

import { FEE_AMOUNT_DETAIL } from './shared'

const ResponsiveText = styled(ThemedText.Label)`
  line-height: 16px;
  font-size: 14px;

  ${({ theme }) => theme.mediaWidth.upToSmall`
    font-size: 12px;
    line-height: 12px;
  `};
`

interface FeeOptionProps {
  feeAmount: FeeAmount
  active: boolean
  distributions: ReturnType<typeof useFeeTierDistribution>['distributions']
  poolState: PoolState
  onClick: () => void
}

export function FeeOption({ feeAmount, active, poolState, distributions, onClick }: FeeOptionProps) {
  let label = FEE_AMOUNT_DETAIL[feeAmount].label
  label += label !== 'Automatic' ? ' blocks' : ''

  return (
    <ButtonRadioChecked active={active} onClick={onClick}>
      <AutoColumn gap="sm" justify="flex-start">
        <AutoColumn justify="flex-start" gap="6px">
          <ResponsiveText>
            <Trans>{label}</Trans>
          </ResponsiveText>
          <ThemedText.Main fontWeight={400} fontSize="12px" textAlign="left">
            {FEE_AMOUNT_DETAIL[feeAmount].description}
          </ThemedText.Main>
        </AutoColumn>

        {/* {distributions && (
          <FeeTierPercentageBadge distributions={distributions} feeAmount={feeAmount} poolState={poolState} />
        )} */}
      </AutoColumn>
    </ButtonRadioChecked>
  )
}
