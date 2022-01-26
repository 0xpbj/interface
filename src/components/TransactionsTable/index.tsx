import Card from 'components/Card'
import { AutoColumn } from 'components/Column'
import HoverInlineText from 'components/HoverInlineText'
import Loader from 'components/Loader'
import { RowFixed } from 'components/Row'
import { Arrow, Break, PageButtons } from 'components/shared'
import { ClickableText, Label } from 'components/Text'
import useTheme from 'hooks/useTheme'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components/macro'
import { ExternalLink, TYPE } from 'theme'
import { LTTransaction, Transaction, TransactionType } from 'types'
import { getEtherscanLink, shortenAddress } from 'utils'
import { formatTime } from 'utils/date'
import { formatAmount, formatDollarAmount } from 'utils/numbers'
// import { useActiveNetworkVersion } from 'state/application/hooks'
// import { OptimismNetworkInfo } from 'constants/networks'

// AC: was DarkGreyCard
const Wrapper = styled(Card)`
  width: 100%;
`

const ResponsiveGrid = styled.div`
  display: grid;
  grid-gap: 1em;
  align-items: center;

  grid-template-columns: 1.5fr repeat(5, 1fr);

  @media screen and (max-width: 940px) {
    grid-template-columns: 1.5fr repeat(4, 1fr);
    & > *:nth-child(5) {
      display: none;
    }
  }

  @media screen and (max-width: 800px) {
    grid-template-columns: 1.5fr repeat(2, 1fr);
    & > *:nth-child(5) {
      display: none;
    }
    & > *:nth-child(3) {
      display: none;
    }
    & > *:nth-child(4) {
      display: none;
    }
  }

  @media screen and (max-width: 500px) {
    grid-template-columns: 1.5fr repeat(1, 1fr);
    & > *:nth-child(5) {
      display: none;
    }
    & > *:nth-child(3) {
      display: none;
    }
    & > *:nth-child(4) {
      display: none;
    }
    & > *:nth-child(2) {
      display: none;
    }
  }
`

const SortText = styled.button<{ active: boolean }>`
  cursor: pointer;
  font-weight: ${({ active }) => (active ? 500 : 400)};
  margin-right: 0.75rem !important;
  border: none;
  background-color: transparent;
  font-size: 1rem;
  padding: 0px;
  color: ${({ active, theme }) => (active ? theme.text1 : theme.text3)};
  outline: none;
  @media screen and (max-width: 600px) {
    font-size: 14px;
  }
`

const SORT_FIELD = {
  amountUSD: 'amountUSD',
  timestamp: 'timestamp',
  sender: 'sender',
  amountToken0: 'amountToken0',
  amountToken1: 'amountToken1',
}

const DataRow = ({ transaction, color }: { transaction: Transaction; color?: string }) => {
  const abs0 = Math.abs(transaction.amountToken0)
  const abs1 = Math.abs(transaction.amountToken1)
  const outputTokenSymbol = transaction.amountToken0 < 0 ? transaction.token0Symbol : transaction.token1Symbol
  const inputTokenSymbol = transaction.amountToken1 < 0 ? transaction.token0Symbol : transaction.token1Symbol
  // const [activeNetwork] = useActiveNetworkVersion()
  const activeNetwork = 'mainnet'
  const theme = useTheme()

  const operations: any = {
    [TransactionType.SWAP]: `Swap ${inputTokenSymbol} for ${outputTokenSymbol}`,
    [TransactionType.MINT]: `Add liquidity (${transaction.token0Symbol}, ${transaction.token1Symbol})`,
    [TransactionType.BURN]: `Remove liquidity (${transaction.token0Symbol}, ${transaction.token1Symbol})`,
    [TransactionType.LTSWAP]: `LT Swap ${inputTokenSymbol} for ${outputTokenSymbol}`,
    [TransactionType.WITHDRAW]: `Withdraw ${outputTokenSymbol}`,
    [TransactionType.EXEC_VIRTUAL]: `Execute virtual order`,
    [TransactionType.INITIAL_LIQUIDITY]: `Initial liquidity (${transaction.token0Symbol}, ${transaction.token1Symbol})`,
    [TransactionType.DEPLOY]: `Deploy TWAMM contract`,
    [TransactionType.APPROVE]: `Wallet token approval.`,
    [TransactionType.ARB_SWAP]: `Arbitrage ${inputTokenSymbol} for ${outputTokenSymbol}`,
  }
  const txnType: any = Number(transaction.type)
  const opLabel = operations.hasOwnProperty(txnType) ? operations[txnType] : 'Unknown operation'

  return (
    <ResponsiveGrid>
      <Label color={color ?? theme.blue1} fontWeight={400}>
        {opLabel}
      </Label>
      {/* <Label end={1} fontWeight={400}>
        {formatDollarAmount(transaction.amountUSD)}
      </Label>
      <Label end={1} fontWeight={400}>
        <HoverInlineText text={`${formatAmount(abs0)}  ${transaction.token0Symbol}`} maxCharacters={16} />
      </Label>
      <Label end={1} fontWeight={400}>
        <HoverInlineText text={`${formatAmount(abs1)}  ${transaction.token1Symbol}`} maxCharacters={16} />
      </Label> */}
      <Label end={1} fontWeight={400}>
        100 ETH {/* TODO */}
      </Label>
      <Label end={1} fontWeight={400}>
        100 USDC {/* TODO */}
      </Label>
      <Label end={1} fontWeight={400}>
        <ExternalLink href={getEtherscanLink(1, transaction.sender, 'address')} style={{ color: color ?? theme.blue1 }}>
          {shortenAddress(transaction.sender)}
        </ExternalLink>
      </Label>
      <Label end={1} fontWeight={400}>
        {/* {formatTime(transaction.timestamp, 0)} */}
        {Math.floor(parseFloat(transaction.timestamp))}
      </Label>
    </ResponsiveGrid>
  )
}

export default function TransactionTable({
  transactions,
  maxItems = 10,
  color,
}: {
  transactions: LTTransaction[]
  maxItems?: number
  color?: string
}) {
  // theming
  const theme = useTheme()

  // for sorting
  const [sortField, setSortField] = useState(SORT_FIELD.timestamp)
  const [sortDirection, setSortDirection] = useState<boolean>(true)

  // pagination
  const [page, setPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)

  useEffect(() => {
    let extraPages = 1
    if (transactions.length % maxItems === 0) {
      extraPages = 0
    }
    setMaxPage(Math.floor(transactions.length / maxItems) + extraPages)
  }, [maxItems, transactions])

  // filter on txn type
  const [txFilter, setTxFilter] = useState<TransactionType | undefined>(undefined)

  const sortedTransactions = useMemo(() => {
    return transactions
      ? transactions
          .slice()
          .sort((a, b) => {
            if (a && b) {
              return Number(a[sortField as keyof Transaction]) > Number(b[sortField as keyof Transaction])
                ? (sortDirection ? -1 : 1) * 1
                : (sortDirection ? -1 : 1) * -1
            } else {
              return -1
            }
          })
          .filter((x) => {
            return txFilter === undefined || x.type === txFilter
          })
          .slice(maxItems * (page - 1), page * maxItems)
      : []
  }, [transactions, maxItems, page, sortField, sortDirection, txFilter])

  const handleSort = useCallback(
    (newField: string) => {
      setSortField(newField)
      setSortDirection(sortField !== newField ? true : !sortDirection)
    },
    [sortDirection, sortField]
  )

  const arrow = useCallback(
    (field: string) => {
      return sortField === field ? (!sortDirection ? '↑' : '↓') : ''
    },
    [sortDirection, sortField]
  )

  if (!transactions) {
    return <Loader />
  }

  return (
    <Wrapper>
      <AutoColumn gap="16px">
        <ResponsiveGrid>
          <RowFixed>
            {/* <SortText
              onClick={() => {
                setTxFilter(undefined)
              }}
              active={txFilter === undefined}
            >
              All
            </SortText> */}
            <SortText
              onClick={() => {
                setTxFilter(undefined)
              }}
              active={txFilter === undefined}
            >
              Operation
            </SortText>
            {/* <SortText
              onClick={() => {
                setTxFilter(TransactionType.MINT)
              }}
              active={txFilter === TransactionType.MINT}
            >
              Adds
            </SortText>
            <SortText
              onClick={() => {
                setTxFilter(TransactionType.BURN)
              }}
              active={txFilter === TransactionType.BURN}
            >
              Removes
            </SortText> */}
          </RowFixed>
          {/* <ClickableText color={theme.text2} onClick={() => handleSort(SORT_FIELD.amountUSD)} end={1}>
            Total Value {arrow(SORT_FIELD.amountUSD)}
          </ClickableText>
          <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.amountToken0)}>
            Token Amount {arrow(SORT_FIELD.amountToken0)}
          </ClickableText>
          <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.amountToken1)}>
            Token Amount {arrow(SORT_FIELD.amountToken1)}
          </ClickableText> */}
          <ClickableText color={theme.text2} end={1} onClick={() => {return}}>
            Sent
          </ClickableText>
          <ClickableText color={theme.text2} end={1} onClick={() => {return}}>
            Received
          </ClickableText>
          <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.sender)}>
            Account {arrow(SORT_FIELD.sender)}
          </ClickableText>
          <ClickableText color={theme.text2} end={1} onClick={() => handleSort(SORT_FIELD.timestamp)}>
            Block {arrow(SORT_FIELD.timestamp)}
          </ClickableText>
        </ResponsiveGrid>
        <Break />

        {sortedTransactions.map((t, i) => {
          if (t) {
            return (
              <React.Fragment key={i}>
                <DataRow transaction={t} color={color} />
                <Break />
              </React.Fragment>
            )
          }
          return null
        })}
        {sortedTransactions.length === 0 ? <TYPE.main>No Transactions</TYPE.main> : undefined}
        <PageButtons>
          <div
            onClick={() => {
              setPage(page === 1 ? page : page - 1)
            }}
          >
            <Arrow faded={page === 1 ? true : false}>←</Arrow>
          </div>
          <TYPE.body>{'Page ' + page + ' of ' + maxPage}</TYPE.body>
          <div
            onClick={() => {
              setPage(page === maxPage ? page : page + 1)
            }}
          >
            <Arrow faded={page === maxPage ? true : false}>→</Arrow>
          </div>
        </PageButtons>
      </AutoColumn>
    </Wrapper>
  )
}
