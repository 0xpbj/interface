import { Trans } from '@lingui/macro'
import { Percent } from '@uniswap/sdk-core'
import { darken } from 'polished'
import { useContext } from 'react'
import { useBlockDelay, useSetBlockDelay, useSetUserTradeDuration, useUserTradeDuration } from 'state/user/hooks'
import styled, { ThemeContext } from 'styled-components/macro'

import { ThemedText } from '../../theme'
import { AutoColumn } from '../Column'
import QuestionHelper from '../QuestionHelper'
import { RowBetween, RowFixed } from '../Row'

const FancyButton = styled.button`
  color: ${({ theme }) => theme.text1};
  align-items: center;
  height: 2rem;
  border-radius: 36px;
  font-size: 1rem;
  width: auto;
  min-width: 3.5rem;
  border: 1px solid ${({ theme }) => theme.bg3};
  outline: none;
  background: ${({ theme }) => theme.bg1};
  :hover {
    border: 1px solid ${({ theme }) => theme.bg4};
  }
  :focus {
    border: 1px solid ${({ theme }) => theme.primary1};
  }
`

const Option = styled(FancyButton)<{ active: boolean }>`
  margin-right: 8px;
  :hover {
    cursor: pointer;
  }
  background-color: ${({ active, theme }) => active && theme.primary1};
  color: ${({ active, theme }) => (active ? theme.white : theme.text1)};
`

const Input = styled.input`
  background: ${({ theme }) => theme.bg1};
  font-size: 16px;
  width: auto;
  outline: none;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }
  color: ${({ theme, color }) => (color === 'red' ? theme.red1 : theme.text1)};
  text-align: right;
`

const OptionCustom = styled(FancyButton)<{ active?: boolean; warning?: boolean }>`
  height: 2rem;
  position: relative;
  padding: 0 0.75rem;
  flex: 1;
  border: ${({ theme, active, warning }) =>
    active ? `1px solid ${warning ? theme.red1 : theme.primary1}` : warning && `1px solid ${theme.red1}`};
  :hover {
    border: ${({ theme, active, warning }) =>
      active && `1px solid ${warning ? darken(0.1, theme.red1) : darken(0.1, theme.primary1)}`};
  }

  input {
    width: 100%;
    height: 100%;
    border: 0px;
    border-radius: 2rem;
  }
`

interface TransactionSettingsProps {
  placeholderSlippage: Percent // varies according to the context in which the settings dialog is placed
}

export default function TransactionSettings({
  placeholderSlippage,
  getHistoricQuote,
}: {
  placeholderSlippage: Percent
  getHistoricQuote?: () => Promise<any>
}) {
  const theme = useContext(ThemeContext)

  const userTradeDuration = useUserTradeDuration()
  const setUserTradeDuration = useSetUserTradeDuration()

  const blockDelay = useBlockDelay()
  const setBlockDelay = useSetBlockDelay()

  function parseTradeDuration(value: string) {
    if (value.length === 0) {
      setUserTradeDuration('auto')
    } else {
      setUserTradeDuration(parseFloat(value))
    }
    getHistoricQuote?.()
  }

  function parseBlockDelay(value: string) {
    if (value.length === 0) {
      setBlockDelay(0)
    } else {
      const parsed: number = Math.floor(parseFloat(value))
      setBlockDelay(parsed)
    }
  }

  return (
    <AutoColumn gap="md">
      <AutoColumn gap="sm">
        <RowFixed>
          <ThemedText.Black fontWeight={400} fontSize={14} color={theme.text2}>
            <Trans>Number of Blocks</Trans>
          </ThemedText.Black>
          <QuestionHelper text={<Trans>Your transaction will complete in the specified number of blocks.</Trans>} />
        </RowFixed>
        <RowBetween>
          <Option
            onClick={() => {
              parseTradeDuration('')
            }}
            active={userTradeDuration === 'auto'}
          >
            <Trans>Auto</Trans>
          </Option>
          <OptionCustom active={userTradeDuration !== 'auto'} tabIndex={-1}>
            <RowBetween>
              <Input
                placeholder={'1000'}
                value={userTradeDuration}
                onChange={(e) => parseTradeDuration(e.target.value)}
              />
            </RowBetween>
          </OptionCustom>
        </RowBetween>
      </AutoColumn>
      <AutoColumn gap="sm">
        <RowFixed>
          <ThemedText.Black fontSize={14} fontWeight={400} color={theme.text2}>
            <Trans>Delay between blocks</Trans>
          </ThemedText.Black>
          <QuestionHelper text={<Trans>Amount of time delay between blocks.</Trans>} />
        </RowFixed>
        <RowFixed>
          <OptionCustom style={{ width: '80px' }} tabIndex={-1}>
            <Input placeholder={'0'} value={blockDelay} onChange={(e) => parseBlockDelay(e.target.value)} />
          </OptionCustom>
          <ThemedText.Body style={{ paddingLeft: '8px' }} fontSize={14}>
            <Trans>ms</Trans>
          </ThemedText.Body>
        </RowFixed>
      </AutoColumn>
    </AutoColumn>
  )
}
