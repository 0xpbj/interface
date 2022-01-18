import { BigNumber } from '@ethersproject/bignumber'
import { Trans } from '@lingui/macro'
import { Currency, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { FeeAmount } from '@uniswap/v3-sdk'
import UnsupportedCurrencyFooter from 'components/swap/UnsupportedCurrencyFooter'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import { useV3DerivedMintInfo, useV3MintActionHandlers, useV3MintState } from 'state/mint/v3/hooks'
import { TYPE } from 'theme'
import { unixToDate } from 'utils/date'

import { ButtonLight, ButtonText } from '../../components/Button'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import FeeSelector from '../../components/FeeSelector'
import LineChart from '../../components/LineChart'
import { AddRemoveTabs } from '../../components/NavigationTabs'
import RateToggle from '../../components/RateToggle'
import Row, { RowBetween } from '../../components/Row'
import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
import TransactionTable from '../../components/TransactionsTable'
import { sampleChartData } from '../../constants/sampleChartData'
import { sampleTransactions } from '../../constants/sampleTransactions'
import { WRAPPED_NATIVE_CURRENCY } from '../../constants/tokens'
import { useCurrency } from '../../hooks/Tokens'
import { useDerivedPositionInfo } from '../../hooks/useDerivedPositionInfo'
import { useIsSwapUnsupported } from '../../hooks/useIsSwapUnsupported'
import { initSimulator, pause, play, reset, testAsClient } from '../../hooks/useSocketClient'
import { useUSDCValue } from '../../hooks/useUSDCPrice'
import { useV3PositionFromTokenId } from '../../hooks/useV3Positions'
import { useActiveWeb3React } from '../../hooks/web3'
import { Bound, Field } from '../../state/mint/v3/actions'
import { ThemedText } from '../../theme'
import { currencyId } from '../../utils/currencyId'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { CurrencyDropdown, DynamicSection, MediumOnly, PageWrapper, ScrollablePage, Wrapper } from './styled'
import { useSetUserSlippageTolerance, useUserSlippageTolerance, useUserTransactionTTL } from 'state/user/hooks'


const DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE = new Percent(50, 10_000)

export default function AddLiquidity({
  match: {
    params: { currencyIdA, currencyIdB, feeAmount: feeAmountFromUrl, tokenId },
  },
  history,
}: RouteComponentProps<{ currencyIdA?: string; currencyIdB?: string; feeAmount?: string; tokenId?: string }>) {
  const { chainId } = useActiveWeb3React()

  // check for existing position if tokenId in url
  const { position: existingPositionDetails, loading: positionLoading } = useV3PositionFromTokenId(
    tokenId ? BigNumber.from(tokenId) : undefined
  )
  const hasExistingPosition = !!existingPositionDetails && !positionLoading
  const { position: existingPosition } = useDerivedPositionInfo(existingPositionDetails)

  // fee selection from url
  const feeAmount: FeeAmount | undefined =
    feeAmountFromUrl && Object.values(FeeAmount).includes(parseFloat(feeAmountFromUrl))
      ? parseFloat(feeAmountFromUrl)
      : undefined

  const baseCurrency = useCurrency(currencyIdA)
  const currencyB = useCurrency(currencyIdB)
  // prevent an error if they input ETH/WETH
  const quoteCurrency =
    baseCurrency && currencyB && baseCurrency.wrapped.equals(currencyB.wrapped) ? undefined : currencyB

  // mint state
  const { independentField, typedValue } = useV3MintState()

  const {
    ticks,
    pricesAtTicks,
    dependentField,
    parsedAmounts,
    currencyBalances,
    noLiquidity,
    currencies,
    depositADisabled,
    depositBDisabled,
    ticksAtLimit,
    invertPrice,
  } = useV3DerivedMintInfo(
    baseCurrency ?? undefined,
    quoteCurrency ?? undefined,
    feeAmount,
    baseCurrency ?? undefined,
    existingPosition
  )

  const { onFieldAInput, onFieldBInput, onLeftRangeInput, onRightRangeInput, onStartPriceInput } =
    useV3MintActionHandlers(noLiquidity)

  // get formatted amounts
  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: parsedAmounts[dependentField]?.toSignificant(6) ?? '',
  }

  const usdcValues = {
    [Field.CURRENCY_A]: useUSDCValue(parsedAmounts[Field.CURRENCY_A]),
    [Field.CURRENCY_B]: useUSDCValue(parsedAmounts[Field.CURRENCY_B]),
  }

  initSimulator()

  const userSlippageTolerance = useUserSlippageTolerance()

  const handlePlay = async () => {
    let numIntervals = 0
    const blockInterval = 10
    const amt = parseFloat(formattedAmounts[Field.CURRENCY_A])
    if (userSlippageTolerance !== 'auto') {
      numIntervals = Number(userSlippageTolerance.toFixed(0)) / blockInterval
      await play(amt, 0, numIntervals, blockInterval)
    } else {
      await play(amt, 0, 10, 10)
    }
  }

  const handlePause = async () => {
    await pause()
  }

  const handleReset = async () => {
    await reset()
  }

  // useTestAsClient()
  // useEffect(() => useTestAsClient())
  useEffect(() => {
    console.log(`DEBUG: disabled testAsClient in intext.tsx`)
    if (false) {
      testAsClient()
    }
  }, [])

  // get the max amounts user can add
  const maxAmounts: { [field in Field]?: CurrencyAmount<Currency> } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmountSpend(currencyBalances[field]),
      }
    },
    {}
  )

  const atMaxAmounts: { [field in Field]?: CurrencyAmount<Currency> } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmounts[field]?.equalTo(parsedAmounts[field] ?? '0'),
      }
    },
    {}
  )

  const handleCurrencySelect = useCallback(
    (currencyNew: Currency, currencyIdOther?: string): (string | undefined)[] => {
      const currencyIdNew = currencyId(currencyNew)

      if (currencyIdNew === currencyIdOther) {
        // not ideal, but for now clobber the other if the currency ids are equal
        return [currencyIdNew, undefined]
      } else {
        // prevent weth + eth
        const isETHOrWETHNew =
          currencyIdNew === 'ETH' ||
          (chainId !== undefined && currencyIdNew === WRAPPED_NATIVE_CURRENCY[chainId]?.address)
        const isETHOrWETHOther =
          currencyIdOther !== undefined &&
          (currencyIdOther === 'ETH' ||
            (chainId !== undefined && currencyIdOther === WRAPPED_NATIVE_CURRENCY[chainId]?.address))

        if (isETHOrWETHNew && isETHOrWETHOther) {
          return [currencyIdNew, undefined]
        } else {
          return [currencyIdNew, currencyIdOther]
        }
      }
    },
    [chainId]
  )

  const handleCurrencyASelect = useCallback(
    (currencyANew: Currency) => {
      const [idA, idB] = handleCurrencySelect(currencyANew, currencyIdB)
      if (idB === undefined) {
        history.push(`/ltswap/${idA}`)
      } else {
        history.push(`/ltswap/${idA}/${idB}`)
      }
    },
    [handleCurrencySelect, currencyIdB, history]
  )

  const handleCurrencyBSelect = useCallback(
    (currencyBNew: Currency) => {
      const [idB, idA] = handleCurrencySelect(currencyBNew, currencyIdA)
      if (idA === undefined) {
        history.push(`/ltswap/${idB}`)
      } else {
        history.push(`/ltswap/${idA}/${idB}`)
      }
    },
    [handleCurrencySelect, currencyIdA, history]
  )

  const handleFeePoolSelect = useCallback(
    (newFeeAmount: FeeAmount) => {
      onLeftRangeInput('')
      onRightRangeInput('')
      history.push(`/ltswap/${currencyIdA}/${currencyIdB}/${newFeeAmount}`)
    },
    [currencyIdA, currencyIdB, history, onLeftRangeInput, onRightRangeInput]
  )

  const addIsUnsupported = useIsSwapUnsupported(currencies?.CURRENCY_A, currencies?.CURRENCY_B)

  const [valueLabel, setValueLabel] = useState<string | undefined>()
  const [latestValue, setLatestValue] = useState<number | undefined>()

  const formattedTvlData = useMemo(() => {
    if (sampleChartData) {
      return sampleChartData.map((day) => {
        return {
          time: unixToDate(day.date),
          value: day.totalValueLockedUSD,
        }
      })
    } else {
      return []
    }
  }, [sampleChartData])

  const clearAll = useCallback(() => {
    onFieldAInput('')
    onFieldBInput('')
    onLeftRangeInput('')
    onRightRangeInput('')
    history.push(`/add`)
  }, [history, onFieldAInput, onFieldBInput, onLeftRangeInput, onRightRangeInput])

  // get value and prices at ticks
  const { [Bound.LOWER]: tickLower, [Bound.UPPER]: tickUpper } = ticks
  const { [Bound.LOWER]: priceLower, [Bound.UPPER]: priceUpper } = pricesAtTicks

  const SimulateButtons = () => {
    return (
      <div>
        <ThemedText.Label>
          <Trans>Simulation</Trans>
        </ThemedText.Label>
        <div style={{ width: '100%', height: '10px' }} />

        <RowBetween>
          <ButtonLight onClick={handlePlay} $borderRadius="12px" padding={'12px'}>
            <Trans>Play</Trans>
          </ButtonLight>
          <span style={{ height: '100%', width: '35px' }} />
          <ButtonLight onClick={handlePause} $borderRadius="12px" padding={'12px'}>
            <Trans>Pause</Trans>
          </ButtonLight>
          <span style={{ height: '100%', width: '35px' }} />
          <ButtonLight onClick={handleReset} $borderRadius="12px" padding={'12px'}>
            <Trans>Reset</Trans>
          </ButtonLight>
        </RowBetween>
      </div>
    )
  }

  const acForceEnableSwapAmount = true
  const acShowSetPriceRange = false
  return (
    <>
      <ScrollablePage>
        <PageWrapper wide={!hasExistingPosition}>
          <AddRemoveTabs
            creating={false}
            adding={false}
            longterm={true}
            positionID={tokenId}
            defaultSlippage={DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE}
            showBackLink={!hasExistingPosition}
          >
            {!hasExistingPosition && (
              <Row justifyContent="flex-end" style={{ width: 'fit-content', minWidth: 'fit-content' }}>
                <MediumOnly>
                  <ButtonText onClick={clearAll} margin="0 15px 0 0">
                    <ThemedText.Blue fontSize="12px">
                      <Trans>Clear All</Trans>
                    </ThemedText.Blue>
                  </ButtonText>
                </MediumOnly>
                {baseCurrency && quoteCurrency ? (
                  <RateToggle
                    currencyA={baseCurrency}
                    currencyB={quoteCurrency}
                    handleRateToggle={() => {
                      if (!ticksAtLimit[Bound.LOWER] && !ticksAtLimit[Bound.UPPER]) {
                        onLeftRangeInput((invertPrice ? priceLower : priceUpper?.invert())?.toSignificant(6) ?? '')
                        onRightRangeInput((invertPrice ? priceUpper : priceLower?.invert())?.toSignificant(6) ?? '')
                        onFieldAInput(formattedAmounts[Field.CURRENCY_B] ?? '')
                      }
                      history.push(
                        `/add/${currencyIdB as string}/${currencyIdA as string}${feeAmount ? '/' + feeAmount : ''}`
                      )
                    }}
                  />
                ) : null}
              </Row>
            )}
          </AddRemoveTabs>
          <Wrapper>
            {/* <ResponsiveTwoColumns wide={!hasExistingPosition}> */}
            {/* <AutoColumn gap="lg"> */}
            {!hasExistingPosition && (
              <>
                <div>
                  {/* <AutoColumn gap="md"> */}
                  <RowBetween paddingBottom="20px">
                    <ThemedText.Label>
                      <Trans>Select Pair</Trans>
                    </ThemedText.Label>
                  </RowBetween>
                  <div style={{ width: '100%', height: '10px' }} />

                  <RowBetween>
                    <CurrencyDropdown
                      value={formattedAmounts[Field.CURRENCY_A]}
                      onUserInput={onFieldAInput}
                      hideInput={true}
                      onMax={() => {
                        onFieldAInput(maxAmounts[Field.CURRENCY_A]?.toExact() ?? '')
                      }}
                      onCurrencySelect={handleCurrencyASelect}
                      showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
                      currency={currencies[Field.CURRENCY_A] ?? null}
                      id="add-liquidity-input-tokena"
                      showCommonBases
                    />

                    <div style={{ width: '12px' }} />

                    <CurrencyDropdown
                      value={formattedAmounts[Field.CURRENCY_B]}
                      hideInput={true}
                      onUserInput={onFieldBInput}
                      onCurrencySelect={handleCurrencyBSelect}
                      onMax={() => {
                        onFieldBInput(maxAmounts[Field.CURRENCY_B]?.toExact() ?? '')
                      }}
                      showMaxButton={!atMaxAmounts[Field.CURRENCY_B]}
                      currency={currencies[Field.CURRENCY_B] ?? null}
                      id="add-liquidity-input-tokenb"
                      showCommonBases
                    />
                  </RowBetween>
                  {/* </AutoColumn>{' '} */}
                  <div style={{ width: '100%', height: '20px' }} />
                </div>
              </>
            )}
            {/* </AutoColumn> */}
            {/* AC muckery to get single column ... */}
            {/* </div>
              
              <div> */}
            <DynamicSection>
              {/* <AutoColumn gap="md"> */}
              <ThemedText.Label>
                {hasExistingPosition ? <Trans>Add more liquidity</Trans> : <Trans>Swap Amount</Trans>}
              </ThemedText.Label>
              <div style={{ width: '100%', height: '10px' }} />

              <CurrencyInputPanel
                value={formattedAmounts[Field.CURRENCY_A]}
                onUserInput={onFieldAInput}
                onMax={() => {
                  onFieldAInput(maxAmounts[Field.CURRENCY_A]?.toExact() ?? '')
                }}
                showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
                currency={currencies[Field.CURRENCY_A] ?? null}
                id="add-liquidity-input-tokena"
                fiatValue={usdcValues[Field.CURRENCY_A]}
                showCommonBases
                locked={depositADisabled}
              />
              {/* AC disable entry of 2nd amount b/c swap, not mint */}
            </DynamicSection>
            <DynamicSection disabled={true}>
              <CurrencyInputPanel
                value={formattedAmounts[Field.CURRENCY_B]}
                onUserInput={onFieldBInput}
                onMax={() => {
                  onFieldBInput(maxAmounts[Field.CURRENCY_B]?.toExact() ?? '')
                }}
                showMaxButton={!atMaxAmounts[Field.CURRENCY_B]}
                fiatValue={usdcValues[Field.CURRENCY_B]}
                currency={currencies[Field.CURRENCY_B] ?? null}
                id="add-liquidity-input-tokenb"
                showCommonBases
                locked={depositBDisabled}
              />
              {/* </AutoColumn> */}
              <div style={{ width: '100%', height: '20px' }} />
            </DynamicSection>
            {/* </div> */}
            {/* AC muckery to get single column */}

            {!hasExistingPosition && acShowSetPriceRange ? null : (
              <div>
                <RowBetween paddingBottom="20px">
                  <ThemedText.Label>
                    <Trans>Trade Length</Trans>
                  </ThemedText.Label>
                </RowBetween>
                <div style={{ width: '100%', height: '10px' }} />

                <FeeSelector
                  disabled={!quoteCurrency || !baseCurrency}
                  feeAmount={feeAmount}
                  handleFeePoolSelect={handleFeePoolSelect}
                  currencyA={baseCurrency ?? undefined}
                  currencyB={quoteCurrency ?? undefined}
                />

                <div style={{ width: '100%', height: '20px' }} />

                {/* <Buttons /> */}
                <SimulateButtons />
              </div>
            )}
            {/* </ResponsiveTwoColumns> */}
          </Wrapper>
        </PageWrapper>

        <TYPE.main fontSize="24px" style={{ marginTop: '24px' }}>
          Swap Graph
        </TYPE.main>
        <PageWrapper wide={!hasExistingPosition}>
          <Wrapper>
            <LineChart
              data={formattedTvlData}
              setLabel={setValueLabel}
              color={'#2172E5'}
              minHeight={340}
              setValue={setLatestValue}
            />
            {/*value={formattedTvlData ? formatDollarAmount(formattedTvlData[formattedTvlData.length - 1]?.value) : 0}
            label={valueLabel}*/}
          </Wrapper>
        </PageWrapper>

        <TYPE.main fontSize="24px" style={{ marginTop: '24px' }}>
          Transactions
        </TYPE.main>
        <PageWrapper wide={!hasExistingPosition}>
            <TransactionTable transactions={sampleTransactions} />
            {addIsUnsupported && (
              <UnsupportedCurrencyFooter
                show={addIsUnsupported}
                currencies={[currencies.CURRENCY_A, currencies.CURRENCY_B]}
              />
            )}
        </PageWrapper>
      </ScrollablePage>
      <SwitchLocaleLink />
    </>
  )
}
