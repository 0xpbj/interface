import { RowBetween } from 'components/Row'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import usePrevious from 'hooks/usePrevious'
import useTheme from 'hooks/useTheme'
// import { createChart, IChartApi } from 'lightweight-charts'
import * as LightweightCharts from 'lightweight-charts'
import { darken } from 'polished'
import React, { Dispatch, ReactNode, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components/macro'
import { formatDollarAmount } from 'utils/numbers'

import Card from '../Card'
dayjs.extend(utc)

const Wrapper = styled(Card)`
  width: 100%;
  padding: 1rem;
  display: flex;
  background-color: ${({ theme }) => theme.bg0}
  flex-direction: column;
  > * {
    font-size: 1rem;
  }
`

const DEFAULT_HEIGHT = 300

export type AreaChartProps = {
  dataA: any[]
  dataB: any[]
  color?: string | undefined
  height?: number | undefined
  minHeight?: number
  setValue?: Dispatch<SetStateAction<number | undefined>> // used for value on hover
  setLabel?: Dispatch<SetStateAction<string | undefined>> // used for label value
  topLeft?: ReactNode | undefined
  topRight?: ReactNode | undefined
  bottomLeft?: ReactNode | undefined
  bottomRight?: ReactNode | undefined
} & React.HTMLAttributes<HTMLDivElement>

const AreaChart = ({
  dataA,
  dataB,
  color = '#56B2A4',
  setValue,
  setLabel,
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  height = DEFAULT_HEIGHT,
  minHeight = DEFAULT_HEIGHT,
  ...rest
}: AreaChartProps) => {
  // theming
  const theme = useTheme()
  const textColor = theme.text2

  // chart pointer
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartCreated, setChart] = useState<LightweightCharts.IChartApi | undefined>()

  // const dataPrev = usePrevious(data)
  // PBFS:  This causes mucho flicker--it's sensible for Uni, not for us.
  //        Commented out for now--not sure what side effects it will cause when
  //        we introduce more trades, reset, etc.:
  //
  // reset on new data
  // useEffect(() => {
  //   if (dataPrev !== data && chartCreated) {
  //     chartCreated.resize(0, 0)
  //     setChart(undefined)
  //   }
  // }, [data, dataPrev, chartCreated])

  // for reseting value on hover exit
  const currentValue = dataA[dataA.length - 1]?.value

  const handleResize = useCallback(() => {
    if (chartCreated && chartRef?.current?.parentElement) {
      chartCreated.resize(chartRef.current.parentElement.clientWidth - 32, height)
      chartCreated.timeScale().fitContent()
      chartCreated.timeScale().scrollToPosition(0, false)
    }
  }, [chartCreated, chartRef, height])

  // add event listener for resize
  const isClient = typeof window === 'object'
  useEffect(() => {
    if (!isClient) {
      return
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isClient, chartRef, handleResize]) // Empty array ensures that effect is only run on mount and unmount

  // if chart not instantiated in canvas, create it
  useEffect(() => {
    if (!chartCreated && dataA && dataB && !!chartRef?.current?.parentElement) {
      const chart = LightweightCharts.createChart(chartRef.current, {
        height,
        width: chartRef.current.parentElement.clientWidth - 32,
        layout: {
          backgroundColor: 'transparent',
          textColor: '#565A69',
          fontFamily: 'Inter var',
        },
        rightPriceScale: {
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
          drawTicks: false,
          borderVisible: false,
          mode: LightweightCharts.PriceScaleMode.Percentage,
          borderColor: 'rgba(197, 203, 206, 0.4)',
        },
        timeScale: {
          borderColor: 'rgba(197, 203, 206, 0.4)',
          borderVisible: false,
          visible: false,
        },
        watermark: {
          color: 'rgba(0, 0, 0, 0)',
        },
        grid: {
          horzLines: {
            // visible: false,
            style: LightweightCharts.LineStyle.Dotted,
            color: 'rgba(197, 203, 206, 0.4)',
          },
          vertLines: {
            // visible: false,
            style: LightweightCharts.LineStyle.Dotted,
            color: 'rgba(197, 203, 206, 0.4)',
          },
        },
        crosshair: {
          horzLine: {
            visible: false,
            labelVisible: false,
          },
          vertLine: {
            visible: true,
            style: 0,
            width: 2,
            color: '#505050',
            labelVisible: false,
          },
        },
      })
      chart.timeScale().fitContent()
      setChart(chart)
    }
  }, [color, chartCreated, currentValue, dataA, dataB, height, setValue, textColor, theme])

  useEffect(() => {
    if (chartCreated && dataA && dataB) {
      // const series = chartCreated.addAreaSeries({
      //   lineColor: color,
      //   topColor: darken(0.36, color),
      //   bottomColor: theme.bg0,
      //   lineWidth: 2,
      //   priceLineVisible: false,
      // })
      // series.setData(data)
      const areaSeries = chartCreated.addAreaSeries({
        topColor: 'rgba(67, 83, 254, 0.7)',
        bottomColor: 'rgba(67, 83, 254, 0.3)',
        lineColor: 'rgba(67, 83, 254, 1)',
        lineWidth: 2,
      })
      const extraSeries = chartCreated.addAreaSeries({
        topColor: 'rgba(255, 192, 0, 0.7)',
        bottomColor: 'rgba(255, 192, 0, 0.3)',
        lineColor: 'rgba(255, 192, 0, 1)',
        lineWidth: 2,
      })
      areaSeries.setData(dataA)
      extraSeries.setData(dataB)
      chartCreated.timeScale().fitContent()
      chartCreated.timeScale().scrollToRealTime()

      // areaSeries.applyOptions({
      //   priceFormat: {
      //     type: 'custom',
      //     minMove: 0.02,
      //     formatter: (price: any) => formatDollarAmount(price),
      //   },
      // })

      // extraSeries.applyOptions({
      //   priceFormat: {
      //     type: 'custom',
      //     minMove: 0.02,
      //     formatter: (price: any) => formatDollarAmount(price),
      //   },
      // })

      // update the title when hovering on the chart
      // chartCreated.subscribeCrosshairMove(function (param) {
      //   if (
      //     chartRef?.current &&
      //     (param === undefined ||
      //       param.time === undefined ||
      //       (param && param.point && param.point.x < 0) ||
      //       (param && param.point && param.point.x > chartRef.current.clientWidth) ||
      //       (param && param.point && param.point.y < 0) ||
      //       (param && param.point && param.point.y > height))
      //   ) {
      //     setValue && setValue(undefined)
      //     setLabel && setLabel(undefined)
      //   } else if (areaSeries && param) {
      //     const price = parseFloat(param?.seriesPrices?.get(areaSeries)?.toString() ?? currentValue)
      //     const time = param?.time as { day: number; year: number; month: number }
      //     const timeString = dayjs(time.year + '-' + time.month + '-' + time.day).format('MMM D, YYYY')
      //     setValue && setValue(price)
      //     setLabel && timeString && setLabel(timeString)
      //   }
      // })
    }
  }, [chartCreated, color, currentValue, dataA, dataB, height, setLabel, setValue, theme.bg0])

  return (
    <Wrapper minHeight={minHeight}>
      <RowBetween>
        {topLeft ?? null}
        {topRight ?? null}
      </RowBetween>
      <div ref={chartRef} id={'area-chart'} {...rest} />
      <RowBetween>
        {bottomLeft ?? null}
        {bottomRight ?? null}
      </RowBetween>
    </Wrapper>
  )
}

export default AreaChart
