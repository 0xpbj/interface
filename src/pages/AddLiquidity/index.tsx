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
import { timestampToYYYYMMDD } from 'utils/date'

import AreaChart from '../../components/AreaChart'
import { ButtonPrimary, ButtonRed, ButtonYellow } from '../../components/Button'
import CurrencyDisplayPanel from '../../components/CurrencyDisplayPanel'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import Loader from '../../components/Loader'
import { AddRemoveTabs } from '../../components/NavigationTabs'
import { RowBetween } from '../../components/Row'
import { SwitchLocaleLink } from '../../components/SwitchLocaleLink'
import TransactionTable from '../../components/TransactionsTable'
import { WRAPPED_NATIVE_CURRENCY } from '../../constants/tokens'
import { useCurrency } from '../../hooks/Tokens'
import { useDerivedPositionInfo } from '../../hooks/useDerivedPositionInfo'
import { useIsSwapUnsupported } from '../../hooks/useIsSwapUnsupported'
import {
  _clientSocket,
  historicQuote,
  initSimulator,
  pause,
  play,
  reset,
  testAsClient,
} from '../../hooks/useSocketClient'
import { useUSDCValue } from '../../hooks/useUSDCPrice'
import { useV3PositionFromTokenId } from '../../hooks/useV3Positions'
import { useActiveWeb3React } from '../../hooks/web3'
import { Bound, Field } from '../../state/mint/v3/actions'
import { ThemedText } from '../../theme'
import { currencyId } from '../../utils/currencyId'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { CurrencyDropdown, DynamicSection, PageWrapper, ScrollablePage } from './styled'

const DEFAULT_ADD_IN_RANGE_SLIPPAGE_TOLERANCE = new Percent(50, 10_000)

const DAY_MS = 24 * 60 * 60 * 1000
const BLOCK_TIME_MS = DAY_MS // 14 seconds -> 1d b/c of bad chart solution for now
let fakeDateMs = Date.now() - 100 * 365 * DAY_MS // ~100 years ago (each block is a day, gives us ~36500 blocks)

type InfoType = {
  id: number | undefined
  command: string
  flag: boolean
}

function numberWithCommas(x: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'decimal', maximumFractionDigits: 3 }).format(x)
}

function InfoBox({ message, icon }: { message?: ReactNode; icon: ReactNode }) {
  return (
    <ColumnCenter style={{ height: '100%', justifyContent: 'center', marginTop: 20, marginBottom: 20 }}>
      <RowBetween style={{ height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ height: '100%', flex: 1 }} />
        {message && (
          <ThemedText.MediumHeader padding={10} textAlign="center">
            {message}
          </ThemedText.MediumHeader>
        )}
        {icon}
        <span style={{ height: '100%', flex: 1 }} />
      </RowBetween>
    </ColumnCenter>
  )
}

let hqRunning = false

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
    price,
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

  // const [valueLabel, setValueLabel] = useState<string | undefined>()
  // const [latestValue, setLatestValue] = useState<number | undefined>()
  // const CHECK_IF_SWAP_IS_ACTIVE = true
  const [isSwapActive, setSwapActive] = useState<boolean | undefined>()

  const [infoObj, setInfoObj] = useState<InfoType | undefined>()
  const [txObj, setTxObj] = useState<LTTransaction[]>([])
  const [areaAObj, setAreaAObj] = useState<any[]>([])
  const [areaBObj, setAreaBObj] = useState<any[]>([])

  const token0Symbol = currencyIdA !== 'ETH' ? 'USDC' : 'ETH'
  const token1Symbol = currencyIdA !== 'ETH' ? 'ETH' : 'USDC'
  const token0Address =
    currencyIdA !== 'ETH' ? '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' : '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
  const token1Address =
    currencyIdA !== 'ETH' ? '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' : '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'

  useEffect(() => {
    if (_clientSocket) {
      _clientSocket.on('status', (statusObj) => {
        // log.debug(`Received status:\n${JSON.stringify(statusObj, null, 2)}`)
        const { data, message } = statusObj
        if (data) {
          const { blockNumber, reserveA, reserveB, transactions } = data
          for (const tx of transactions) {
            const { hash, from, to, uxType, gasUsed, nonce, events } = tx
            // if (uxType !== TransactionType.EXEC_VIRTUAL) {
            let amount = 0
            let amountAIn = 0
            let amountBIn = 0
            let amountAOut = 0
            let amountBOut = 0
            if (events) {
              for (const ev of events) {
                if (ev.amount) {
                  amount = ev.amount
                }
                if (ev.amountAIn) {
                  amountAIn = ev.amountAIn
                }
                if (ev.amountBIn) {
                  amountBIn = ev.amountBIn
                }
                if (ev.amountAOut) {
                  amountAOut = ev.amountAOut
                }
                if (ev.amountBOut) {
                  amountBOut = ev.amountBOut
                }
              }
            }
            setTxObj((oldArray) => [
              ...oldArray,
              {
                type: uxType,
                hash,
                timestamp: (blockNumber + nonce / 10000).toString(),
                sender: from,
                token0Symbol,
                token1Symbol,
                token0Address,
                token1Address,
                amountUSD: gasUsed?.hex,
                amountToken0: reserveA,
                amountToken1: reserveB,
                amount,
                amountAIn,
                amountBIn,
                amountAOut,
                amountBOut,
              },
            ])
            // }
          }
          setInfoObj({
            id: blockNumber,
            command: 'Processing simulation block:',
            flag: true,
          })
          setAreaAObj((oldArray) => [
            ...oldArray,
            {
              time: timestampToYYYYMMDD(fakeDateMs),
              value: reserveA,
            },
          ])
          setAreaBObj((oldArray) => [
            ...oldArray,
            {
              time: timestampToYYYYMMDD(fakeDateMs),
              value: reserveB,
            },
          ])
          fakeDateMs += BLOCK_TIME_MS
          // } else if (message && message !== 'Simulation completed.') {
        } else if (message) {
          setInfoObj({
            id: undefined,
            command: message,
            flag: true,
          })
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

  const [infoMsg, setInfoMsg] = useState<string | undefined>()
  const getNumberOfIntervalsAndBlockIntervals = () => {
    setInfoMsg('')
    const amt = parseFloat(formattedAmounts[Field.CURRENCY_A])
    const amtScale = amt * 10 ** 18
    const blockInterval = 10
    let numberOfIntervals = 0
    if (userTradeDuration !== 'auto') {
      numberOfIntervals = Math.floor(userTradeDuration / blockInterval)
    } /* auto */ else if (!isNaN(amtScale)) {
      //  Auto - algo:
      //  AmountPerBlock = amtScale / (blockInterval * numberOfIntervals) >> 1
      //  AmountPerBlock = amtScale / (blockInterval * numberOfIntervals) > 10
      //  amtScale / (blockInterval * 10) > numberOfIntervals
      const maxNumberOfIntervals = Math.floor(amtScale / (blockInterval * 10))
      if (isNaN(maxNumberOfIntervals)) {
        throw new Error(
          `Specify an amount to automatically compute the length of a long term trade (${amt} tokens specified - ${amtScale} scaled).`
        )
      }
      if (maxNumberOfIntervals < 5) {
        setInfoMsg(
          `Insufficient amount to justify long term trade (${amt} tokens - ${amtScale} scaled). Add more tokens ...`
        )
        // throw new Error(
        //   `Insufficient amount to justify long term trade (${amt} tokens - ${amtScale} scaled). Add more tokens ...`
        // )
      }
      numberOfIntervals = maxNumberOfIntervals - 1
      console.log(`DEBUG - Auto mode - set numberOfIntervals=${numberOfIntervals}`)
    }
    return {
      amt,
      numberOfIntervals,
      blockInterval,
    }
  }

  const handlePlay = async () => {
    setSwapActive(true)
    const { amt, numberOfIntervals, blockInterval } = getNumberOfIntervalsAndBlockIntervals()
    //PB WILL FIX THIS
    //has duplicate call to the above information
    getHistoricQuote()
    console.log(
      `handlePlay:\n  numIntervals=${numberOfIntervals}\n  blockInterval=${blockInterval}\n  mode=${userSlippageTolerance}\n  history=${JSON.stringify(
        history,
        null,
        2
      )}\n`
    )
    // TODO: something more robust than this--this will only work for USDC/ETH hardcoded sim pair
    const amtA = currencyIdA !== 'ETH' ? amt : 0
    const amtB = currencyIdA !== 'ETH' ? 0 : amt
    await play(
      amtA,
      amtB,
      numberOfIntervals,
      blockInterval,
      Number(blockDelay),
      simulateArbitrage,
      marketReserves,
      marketData
    )
  }

  const handlePause = async () => {
    await pause()
  }

  const ZERO = numberWithCommas(0)
  const handleReset = async () => {
    await reset()
    setSwapActive(false)
    setInfoObj(undefined)
    setTxObj([])
    setAreaAObj([])
    setAreaBObj([])
    setMinOutput(ZERO)
    setMaxOutput(ZERO)
    setInfoMsg('')
  }

  const [minOutput, setMinOutput] = useState<string>(ZERO)
  const [maxOutput, setMaxOutput] = useState<string>(ZERO)

  const getHistoricQuote = async (): Promise<void> => {
    /* Only one issuance of this command can be running at once--we don't presently
       have command queueing and calling it multiple times messes up the sequence of 
       values returned (it's a simple sequential handshake).
       If it's already running we just do nothing. */
    // if (!hqRunning) {
    //   hqRunning = true

    console.log('HISTORICAL QUOTE')
    const { amt, numberOfIntervals, blockInterval } = getNumberOfIntervalsAndBlockIntervals()
    const { data } = await historicQuote(numberOfIntervals, blockInterval)
    const { reserveData } = data
    const usdcReserves = reserveData.reserveTokenA
    const ethReserves = reserveData.reserveTokenB
    const amountIn = parseFloat(formattedAmounts[Field.CURRENCY_A])
    if (currencyIdA === 'ETH') {
      const amountOutMax = amountIn * (usdcReserves / ethReserves)
      const k = usdcReserves * ethReserves
      const ammAmountTokenB = k / (ethReserves + amountIn)
      const amountOutMin = 0.997 * (usdcReserves - ammAmountTokenB)
      if (!isNaN(amountOutMax)) {
        setMaxOutput(numberWithCommas(amountOutMax))
      } else {
        setMaxOutput('0')
      }

      if (!isNaN(amountOutMin)) {
        setMinOutput(numberWithCommas(amountOutMin))
      } else {
        setMinOutput('0')
      }
      console.log('MAX', amountOutMax)
      console.log('MIN', amountOutMin)
    } else {
      const amountOutMax = amountIn * (ethReserves / usdcReserves)
      const k = usdcReserves * ethReserves
      const ammAmountTokenB = k / (usdcReserves + amountIn)
      const amountOutMin = 0.997 * (ethReserves - ammAmountTokenB)
      if (!isNaN(amountOutMax)) {
        setMaxOutput(numberWithCommas(amountOutMax))
      } else {
        setMaxOutput('0')
      }

      if (!isNaN(amountOutMin)) {
        setMinOutput(numberWithCommas(amountOutMin))
      } else {
        setMinOutput('0')
      }
      console.log('MAX', amountOutMax)
      console.log('MIN', amountOutMin)
    }

    hqRunning = false
    // }
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

  const formattedAData = useMemo(() => {
    if (areaAObj) {
      return [...areaAObj] // PBFS:  Shallow copy (otherwise charting code doesn't work)
    } else {
      return []
    }
  }, [areaAObj])

  const formattedBData = useMemo(() => {
    if (areaBObj) {
      return [...areaBObj] // PBFS:  Shallow copy (otherwise charting code doesn't work)
    } else {
      return []
    }
  }, [areaBObj])

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

  const acShowSetPriceRange = false
  const theme = useTheme()
  // const priceValue = usdcValues[Field.CURRENCY_A]?.toSignificant(6, { groupSeparator: '' })
  // console.log('Currency A', formattedAmounts[Field.CURRENCY_A])
  // console.log('ETH PRICE', priceValue)
  // if (priceValue) {
  //   console.log('Parsed ETH Price', parseFloat(priceValue))
  // }
  // const maxValue = priceValue ? numberWithCommas(Number.parseFloat(priceValue).toPrecision(9)) : '0'
  // const lowValue = priceValue ? numberWithCommas((Number.parseFloat(priceValue) * 0.96).toPrecision(9)) : '0'
  // const midValue = priceValue ? numberWithCommas((Number.parseFloat(priceValue) * 0.98).toPrecision(9)) : '0'
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
            getHistoricQuote={getHistoricQuote}
          />
          {infoObj?.flag && (
            <InfoBox
              message={<Trans>{`${infoObj.command} ${infoObj?.id}`}</Trans>}
              icon={
                infoObj.command === 'Simulation completed.' ? undefined : <Loader size="30px" stroke={theme.text4} />
              }
            />
          )}
          {infoMsg && <InfoBox message={<Trans>{`${infoMsg}`}</Trans>} icon={undefined}/>}
          {!hasExistingPosition && (
            <>
              <div>
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
                <div style={{ width: '100%', height: '20px' }} />
              </div>
            </>
          )}
          <DynamicSection>
            <ThemedText.Label>
              {hasExistingPosition ? <Trans>Add more liquidity</Trans> : <Trans>Swap Amount</Trans>}
            </ThemedText.Label>
            <div style={{ width: '100%', height: '10px' }} />
            <CurrencyInputPanel
              value={formattedAmounts[Field.CURRENCY_A]}
              onUserInput={(e) => {
                getHistoricQuote()
                onFieldAInput(e)
              }}
              onMax={() => {
                onFieldAInput(maxAmounts[Field.CURRENCY_A]?.toExact() ?? '')
              }}
              showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
              currency={currencies[Field.CURRENCY_A] ?? null}
              id="add-liquidity-input-tokena"
              fiatValue={usdcValues[Field.CURRENCY_A]}
              showCommonBases
              locked={depositADisabled}
              hideBalance={true}
            />
          </DynamicSection>
          <DynamicSection>
            <div style={{ width: '100%', height: '20px' }} />
            <ThemedText.Label>
              <Trans>Estimated Return</Trans>
            </ThemedText.Label>
            <div style={{ width: '100%', height: '10px' }} />
            <CurrencyDisplayPanel
              value={`Min:  ${minOutput}\t\tMax:  ${maxOutput}`}
              fiatValue={usdcValues[Field.CURRENCY_B]}
              currency={currencies[Field.CURRENCY_B] ?? null}
              id="add-liquidity-input-tokenb1"
              locked={depositBDisabled}
              hideInput={false}
              hideBalance={true}
            />
          </DynamicSection>
          {!hasExistingPosition && acShowSetPriceRange ? null : (
            <div>
              <div style={{ width: '100%', height: '20px' }} />
              <SimulateButtons />
            </div>
          )}
        </PageWrapper>

        {areaAObj?.length > 0 && isSwapActive && (
          <>
            <TYPE.main fontSize="24px" style={{ marginTop: '24px' }}>
              Percentage of Pool Reserves from Simulation Start
            </TYPE.main>
            <PageWrapper wide={!hasExistingPosition}>
              <AreaChart dataA={formattedAData} dataB={formattedBData} color={'#2172E5'} minHeight={340} />
            </PageWrapper>

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
