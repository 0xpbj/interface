import { BigNumber } from '@ethersproject/bignumber'
import { Trans } from '@lingui/macro'
import { Currency, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { FeeAmount } from '@uniswap/v3-sdk'
import { ColumnCenter } from 'components/Column'
import UnsupportedCurrencyFooter from 'components/swap/UnsupportedCurrencyFooter'
import useTheme from 'hooks/useTheme'
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import { useV3DerivedMintInfo, useV3MintActionHandlers, useV3MintState } from 'state/mint/v3/hooks'
import {
  useBlockDelay,
  useMarketData,
  useMarketReserves,
  useSimulateArbitrage,
  useUserSlippageTolerance,
  useUserTradeDuration,
} from 'state/user/hooks'
import { TYPE } from 'theme'
import { LTTransaction } from 'types'
import { timestampToYYYYMMDD, unixToDate } from 'utils/date'

import { ButtonPrimary, ButtonRed, ButtonYellow } from '../../components/Button'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import LineChart from '../../components/LineChart'
import Loader from '../../components/Loader'
import { AddRemoveTabs } from '../../components/NavigationTabs'
import RateToggle from '../../components/RateToggle'
import Row, { RowBetween } from '../../components/Row'
import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
import TransactionTable from '../../components/TransactionsTable'
import { sampleChartData } from '../../constants/sampleChartData'
import { WRAPPED_NATIVE_CURRENCY } from '../../constants/tokens'
import { useCurrency } from '../../hooks/Tokens'
import { useDerivedPositionInfo } from '../../hooks/useDerivedPositionInfo'
import { useIsSwapUnsupported } from '../../hooks/useIsSwapUnsupported'
import { _clientSocket, initSimulator, pause, play, reset, testAsClient } from '../../hooks/useSocketClient'
import { useUSDCValue } from '../../hooks/useUSDCPrice'
import { useV3PositionFromTokenId } from '../../hooks/useV3Positions'
import { useActiveWeb3React } from '../../hooks/web3'
import { Bound, Field } from '../../state/mint/v3/actions'
import { ThemedText } from '../../theme'
import { currencyId } from '../../utils/currencyId'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { CurrencyDropdown, DynamicSection, PageWrapper, ScrollablePage, Wrapper } from './styled'
import { TransactionType } from 'types'

const DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE = new Percent(50, 10_000)

const DAY_MS = 24 * 60 * 60 * 1000
const BLOCK_TIME_MS = DAY_MS   // 14 seconds -> 1d b/c of bad chart solution for now
let fakeDateMs = Date.now() - (100 * 365 * DAY_MS)  // ~100 years ago (each block is a day, gives us ~36500 blocks)

type InfoType = {
  id: number
  command: string
  flag: boolean
}

function InfoBox({ message, icon }: { message?: ReactNode; icon: ReactNode }) {
  return (
    <ColumnCenter style={{ height: '100%', justifyContent: 'center' }}>
      {icon}
      {message && (
        <ThemedText.MediumHeader padding={10} marginTop="20px" textAlign="center">
          {message}
        </ThemedText.MediumHeader>
      )}
    </ColumnCenter>
  )
}

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
  const userTradeDuration = useUserTradeDuration()
  const blockDelay = useBlockDelay()

  const [simulateArbitrage] = useSimulateArbitrage()
  const [marketData] = useMarketData()
  const [marketReserves] = useMarketReserves()

  const [valueLabel, setValueLabel] = useState<string | undefined>()
  const [latestValue, setLatestValue] = useState<number | undefined>()
  // const CHECK_IF_SWAP_IS_ACTIVE = true
  const [isSwapActive, setSwapActive] = useState<boolean | undefined>()

  const [infoObj, setInfoObj] = useState<InfoType | undefined>()
  const [txObj, setTxObj] = useState<LTTransaction[]>([])
  const [chartObj, setChartObj] = useState<any[]>([])

  useEffect(() => {
    if (_clientSocket) {
      _clientSocket.on('status', (statusObj) => {
        // log.debug(`Received status:\n${JSON.stringify(statusObj, null, 2)}`)
        const { data, message } = statusObj
        if (data) {
          const { blockNumber, reserveA, reserveB, transactions } = data
          for (const tx of transactions) {
            const { hash, from, to, uxType, gasUsed, nonce } = tx
            if (uxType !== TransactionType.EXEC_VIRTUAL) {
              setTxObj((oldArray) => [
                ...oldArray,
                {
                  type: uxType,
                  hash,
                  timestamp: (blockNumber + nonce/10000).toString(),
                  sender: from,
                  token0Symbol: 'USDC',
                  token1Symbol: 'ETH',
                  token0Address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                  token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                  amountUSD: gasUsed,
                  amountToken0: reserveA,
                  amountToken1: reserveB,
                },
              ])
            }
          }
          setInfoObj({
            id: blockNumber,
            command: 'Running simulation ...',
            flag: true,
          })
          setChartObj((oldArray) => [
            ...oldArray,
            {
              // PBFS:  This chart component is not the right tool for the job. Find
              //        one that handles updates better and scrolling.
              //        Until then, I've mapped each block to a day and we start the chart
              //        at 100 years ago to give us ~36k blocks.
              //        time below represents a block, value represents reserveA
              //        Another thing we'd want to do is draw a second series on this chart.
              //        It's a great component (https://github.com/tradingview/lightweight-charts),
              //        just not for what we're trying to do.
              time: timestampToYYYYMMDD(fakeDateMs),
              value: reserveA
            },
          ])
          fakeDateMs += BLOCK_TIME_MS
        } else {
          setInfoObj({
            id: -1,
            command: message,
            flag: false,
          })
        }
      })
    }
  }, [])

  const handlePlay = async () => {
    setSwapActive(true)
    const amt = parseFloat(formattedAmounts[Field.CURRENCY_A])
    const blockInterval = 10
    let numberOfIntervals = 0

    if (userTradeDuration !== 'auto') {
      numberOfIntervals = Math.floor(userTradeDuration / blockInterval)
    } /* auto */ else {
      //  Auto - algo:
      //  AmountPerBlock = amt / (blockInterval * numberOfIntervals) >> 1
      //  AmountPerBlock = amt / (blockInterval * numberOfIntervals) > 10
      //  amt / (blockInterval * 10) > numberOfIntervals
      const maxNumberOfIntervals = Math.floor(amt / (blockInterval * 10))
      if (isNaN(maxNumberOfIntervals)) {
        throw new Error(
          `Specify an amount to automatically compute the length of a long term trade (${amt} tokens specified).`
        )
      }
      if (maxNumberOfIntervals < 5) {
        throw new Error(`Insufficient amount to justify long term trade (${amt} tokens). Add more tokens ...`)
      }
      numberOfIntervals = maxNumberOfIntervals - 1
      console.log(`DEBUG - Auto mode - set numberOfIntervals=${numberOfIntervals}`)
    }
    console.log(
      `handlePlay:\n  numIntervals=${numberOfIntervals}\n  blockInterval=${blockInterval}\n  mode=${userSlippageTolerance}\n  history=${JSON.stringify(
        history,
        null,
        2
      )}\n`
    )
    await play(
      amt,
      0,
      numberOfIntervals,
      blockInterval,
      Number(blockDelay),
      simulateArbitrage,
      marketData,
      marketReserves
    )
  }

  const handlePause = async () => {
    await pause()
  }

  const handleReset = async () => {
    await reset()
    setSwapActive(false)
    setInfoObj(undefined)
    setTxObj([])
    setChartObj([])
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

  const formattedTvlData = useMemo(() => {
    if (chartObj) {
      return [...chartObj]  // PBFS:  Shallow copy (otherwise charting code doesn't work)
    } else {
      return []
    }
  }, [chartObj])

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
        {/* <ThemedText.Label>
          <Trans>Simulation</Trans>
        </ThemedText.Label> */}
        <div style={{ width: '100%', height: '10px' }} />

        <RowBetween>
          <ButtonPrimary onClick={handlePlay} $borderRadius="12px" padding={'12px'}>
            <Trans>Play</Trans>
          </ButtonPrimary>
          <span style={{ height: '100%', width: '35px' }} />
          <ButtonYellow onClick={handlePause} $borderRadius="12px" padding={'12px'}>
            <Trans>Pause</Trans>
          </ButtonYellow>
          <span style={{ height: '100%', width: '35px' }} />
          <ButtonRed onClick={handleReset} $borderRadius="12px" padding={'12px'}>
            <Trans>Reset</Trans>
          </ButtonRed>
        </RowBetween>
      </div>
    )
  }

  const acForceEnableSwapAmount = true
  const acShowSetPriceRange = false
  const theme = useTheme()
  // console.log("#####TX OBJ", txObj)
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
                {/* <MediumOnly>
                  <ButtonText onClick={clearAll} margin="0 15px 0 0">
                    <ThemedText.Blue fontSize="12px">
                      <Trans>Clear All</Trans>
                    </ThemedText.Blue>
                  </ButtonText>
                </MediumOnly> */}
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
            {infoObj?.flag && (
              <InfoBox
                message={<Trans>{`Processing simulation block: ${infoObj?.id}`}</Trans>}
                icon={<Loader size="40px" stroke={theme.text4} />}
              />
            )}
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
            <DynamicSection>
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
                hideInput={false}
              />
              {/* </AutoColumn> */}
              <div style={{ width: '100%', height: '20px' }} />
            </DynamicSection>
            {/* </div> */}
            {/* AC muckery to get single column */}

            {!hasExistingPosition && acShowSetPriceRange ? null : (
              <div>
                {/* <RowBetween paddingBottom="20px">
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
                /> */}

                <div style={{ width: '100%', height: '20px' }} />

                <SimulateButtons />
              </div>
            )}
            {/* </ResponsiveTwoColumns> */}
          </Wrapper>
        </PageWrapper>

        {isSwapActive && (
          <>
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
          </>
        )}
        {isSwapActive && (
          <>
            <TYPE.main fontSize="24px" style={{ marginTop: '24px' }}>
              Transactions
            </TYPE.main>
            <PageWrapper wide={!hasExistingPosition}>
              <TransactionTable transactions={txObj} />
              {addIsUnsupported && (
                <UnsupportedCurrencyFooter
                  show={addIsUnsupported}
                  currencies={[currencies.CURRENCY_A, currencies.CURRENCY_B]}
                />
              )}
            </PageWrapper>
          </>
        )}
      </ScrollablePage>
      <SwitchLocaleLink />
    </>
  )
}
