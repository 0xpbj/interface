import { RowBetween } from 'components/Row'
import * as LightweightCharts from 'lightweight-charts'
import useTheme from 'hooks/useTheme'
import React, { Dispatch, ReactNode, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components/macro'

import Card from '../Card'

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
  topLeft?: ReactNode | undefined
  topRight?: ReactNode | undefined
  bottomLeft?: ReactNode | undefined
  bottomRight?: ReactNode | undefined
} & React.HTMLAttributes<HTMLDivElement>

const AreaChart = ({
  dataA,
  dataB,
  color = '#56B2A4',
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
  const [chartObj, setChartObj] = useState<LightweightCharts.IChartApi | undefined>()

  const handleResize = useCallback(() => {
    if (chartObj && chartRef?.current?.parentElement) {
      chartObj.resize(chartRef.current.parentElement.clientWidth - 32, height)
      chartObj.timeScale().fitContent()
      chartObj.timeScale().scrollToPosition(0, false)
    }
  }, [chartObj, chartRef, height])

  // add event listener for resize
  const isClient = typeof window === 'object'
  useEffect(() => {
    // console.log(`Chart add resize event listener called:\n` +
    //             `- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - \n`)
    if (!isClient) {
      return
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isClient, chartRef, handleResize]) 

  // if chart not instantiated in canvas, create it
  useEffect(() => {
    // console.log(`Chart Creation Effect Called:\n` +
    //             `- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - \n`)
    if (!chartObj && !!chartRef?.current?.parentElement) {
      const chart = LightweightCharts.createChart(chartRef.current, {
        height,
        width: chartRef.current.parentElement.clientWidth - 32,
        layout: {
          backgroundColor: 'transparent',
          textColor: '#565A69',
          fontFamily: 'Inter var',
        },
        rightPriceScale: {
          visible: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
          drawTicks: false,
          borderVisible: false,
          mode: LightweightCharts.PriceScaleMode.IndexedTo100,
          borderColor: 'rgba(197, 203, 206, 0.4)',
        },
        timeScale: {
          borderColor: 'rgba(197, 203, 206, 0.4)',
          borderVisible: false,
          visible: false,
        },
        watermark: {
          color: 'rgba(0, 0, 0, 0)',
          text: 'Percentage of initial reserves at simulation start.',
          visible: true
        },
        grid: {
          horzLines: {
            visible: false,
            // style: LightweightCharts.LineStyle.Dotted,
            // color: 'rgba(197, 203, 206, 0.4)',
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
            visible: false,
            // style: 0,
            // width: 2,
            // color: '#505050',
            labelVisible: false,
          },
        },
      })
      chart.timeScale().fitContent()
      setChartObj(chart)
    }
  }, [chartObj, color, height, textColor, theme])
  // }, [color, chartObj, dataA, dataB, height, textColor, theme])

  const [sDataA, setSDataA] = useState<any[]>([])
  const [sDataB, setSDataB] = useState<any[]>([])
  const [seriesA, setSeriesA] = useState<LightweightCharts.ISeriesApi<"Line"> | undefined>(undefined)
  const [seriesB, setSeriesB] = useState<LightweightCharts.ISeriesApi<"Line"> | undefined>(undefined)

  useEffect(() => {
    // console.log(`Chart Create Series Called:\n` +
    //             `- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - \n`)
    if (chartObj && dataA && dataB && !seriesA && !seriesB) {
      // console.log(`Adding line series`)
      const _seriesA = chartObj.addLineSeries({
        // title: 'USDC',
        color: 'rgba(67, 83, 254, 1)',
        lineWidth: 2,
        // If we were using update instead of setvalue, the following
        // might not be needed:
        lastPriceAnimation: LightweightCharts.LasPriceAnimationMode.Disabled,
        lastValueVisible: false,
        priceLineVisible: false
      })

      const _seriesB = chartObj.addLineSeries({
        // title: 'ETH',
        color: 'rgba(255, 192, 0, 1)',
        lineWidth: 2,
        // If we were using update instead of setvalue, the following
        // might not be needed:
        lastPriceAnimation: LightweightCharts.LasPriceAnimationMode.Disabled,
        lastValueVisible: false,
        priceLineVisible: false
      })
      _seriesA.setData(dataA)
      _seriesB.setData(dataB)
      setSeriesA(_seriesA)
      setSeriesB(_seriesB)
      chartObj.timeScale().fitContent()
      chartObj.timeScale().scrollToRealTime()
      setSDataA(dataA)
      setSDataB(dataB)
    } else if (chartObj && seriesA && seriesB) {
      // console.log(`Updating data in a line series:\n` +
      //             `  dataA:  received=${dataA.length},  state=${sDataA.length}\n` +
      //             `  dataB:  received=${dataB.length},  state=${sDataB.length}\n`)

      // For some reason react is passing these arrays in at different lengths resulting
      // in more updates than needed, so skip the update until the amount passed in is
      // the same (it's happening b/c of the way state is getting used in the parent component
      // if these were a single object it would update simultaneously)
      if (dataA.length === dataB.length) {
        let changed = false

        if (dataA.length !== sDataA.length) {
          changed = true
          for (let idx = sDataA.length - 1; idx < dataA.length; idx++) {
            seriesA.update(dataA[idx])
          }
          setSeriesA(seriesA)
          setSDataA(dataA)
        }

        if (dataB.length !== sDataB.length) {
          changed = true
          for (let idx = sDataB.length - 1; idx < dataB.length; idx++) {
            seriesB.update(dataB[idx])
          }
          setSeriesB(seriesB)
          setSDataB(dataB)
        }

        if (changed) {
          chartObj.timeScale().fitContent()
          chartObj.timeScale().scrollToRealTime()
        }
      }
    }
  }, [chartObj, dataA, dataB])
  // }, [chartObj, color, dataA, dataB, height, theme.bg0])

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