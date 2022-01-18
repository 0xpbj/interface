import { Pause } from 'react-feather'
import { io, Socket } from 'socket.io-client'

import * as ds from '../utils/debugScopes'
const log = ds.getLog('socketClient')

const _isDev = () => {
  return process.env.REACT_APP_NODE_ENV === 'development'
}

const _serverUrl = () => {
  return _isDev()
    ? `http://localhost:${process.env.REACT_APP_SERVER_PORT}`
    : `${process.env.REACT_APP_SERVER_URL}:${process.env.REACT_APP_SERVER_PORT}`
}

const delayMs = async (delayInMs = 250) => {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve(null)
    }, delayInMs)
  })
}
const runClientCommand = async (clientSocket: any, cmdObj: any) => {
  if (cmdObj.executed) {
    log.error(
      `Command executed already! A new command and id must be created. Ignoring!\n` +
        `Command object:\n${JSON.stringify(cmdObj, null, 2)}`
    )
    return
  }

  clientSocket.emit('client-command', cmdObj)
  cmdObj.executed = true

  await new Promise((resolve) => {
    clientSocket.once('result', (obj: any) => {
      if (obj && obj.result && obj.result.id === cmdObj.id) {
        log.debug(`Command ${cmdObj.command} succeeded.`)
        resolve(null)
      } else {
        const errStr =
          `Failed to get expected acknowledgement of command ${cmdObj.command}. ` +
          `Expected command id ${cmdObj.id}, received response: ` +
          `${JSON.stringify(obj, null, 2)}`

        throw new Error(errStr)
      }
    })
  })
}

type CommandType = {
  id: number
  command: string
  args?: any
}

export const testAsClient = async () => {
  log.debug('****************************Testing client mode ...')
  await delayMs(3000)
  const clientSocket = io(_serverUrl())

  clientSocket.on('connect', async () => {
    log.debug('Connected as client. Starting simulation:')

    let cmdId = 0
    let cmdObj: CommandType
    cmdObj = {
      id: cmdId++,
      command: 'simulation-play',
      args: {
        tokenA: 1000000, // Sell 10M token A for tokenB in an LT Swap
        tokenB: 0,
        numIntervals: 10,
        blockInterval: 10,
        /* more options possible (and in place, get this working first) */
      },
    }
    await runClientCommand(clientSocket, cmdObj)

    await delayMs(3000)

    log.debug('Pausing simulation:')
    cmdObj = { id: cmdId++, command: 'simulation-pause' }
    await runClientCommand(clientSocket, cmdObj)

    await delayMs(3000)

    log.debug('Re-starting simulation:')
    cmdObj = { id: cmdId++, command: 'simulation-play', args: {} }
    await runClientCommand(clientSocket, cmdObj)

    await delayMs(3000)

    log.debug('Resetting simulation:')
    cmdObj = { id: cmdId++, command: 'simulation-reset', args: {} }
    await runClientCommand(clientSocket, cmdObj)

    await delayMs(3000)

    log.debug('Re-starting simulation:')
    cmdObj = {
      id: cmdId++,
      command: 'simulation-play',
      args: {
        tokenA: 1000000, // Sell 10M token A for tokenB in an LT Swap
        tokenB: 0,
        numIntervals: 10,
        blockInterval: 10,
        /* more options possible (and in place, get this working first) */
      },
    }
    await runClientCommand(clientSocket, cmdObj)

    await delayMs(3000)
  })

  clientSocket.on('status', (statusObj) => {
    log.debug(`Received status:\n${JSON.stringify(statusObj, null, 2)}`)
  })

  clientSocket.on('disconnect', (reason) => {
    log.warn(`Server disconnected because ${reason}.`)
  })

  clientSocket.on('connect_error', (error) => {
    log.warn(`Server connection error.\n${error}`)
  })
}




let _cmdId = 0
let _clientSocket: Socket | undefined = undefined

export const initSimulator = async ():Promise<void> => 
{
  if (!_clientSocket) {
    _clientSocket = io(_serverUrl())

    _clientSocket.on('connect', async () => {
      log.debug('Connected as client.')
    })

    _clientSocket.on('status', (statusObj) => {
      log.debug(`Received status:\n${JSON.stringify(statusObj, null, 2)}`)
    })

    _clientSocket.on('disconnect', (reason) => {
      log.warn(`Server disconnected because ${reason}.`)
    })

    _clientSocket.on('connect_error', (error) => {
      log.warn(`Server connection error.\n${error}`)
    })
  }
}

export const play = async(tokenA: number, 
                          tokenB: number,
                          numIntervals: number,
                          blockInterval: number): Promise<void> => {

  log.debug('Running simulation:')

  const cmdObj = {
    id: _cmdId++,
    command: 'simulation-play',
    args: {
      tokenA, // Sell 1M token A for tokenB in an LT Swap
      tokenB,
      numIntervals,
      blockInterval,
      /* more options possible (and in place, get this working first) */
      arbitrage: false,
      useMarketData: true,
    },
  }
  await runClientCommand(_clientSocket, cmdObj)

}

export const pause = async (): Promise<void> => {
  log.debug('Pausing simulation:')
  const cmdObj = { id: _cmdId++, command: 'simulation-pause' }
  await runClientCommand(_clientSocket, cmdObj)
}

export const reset = async(): Promise<void> => {
  log.debug('Resetting simulation:')
  const cmdObj = { id: _cmdId++, command: 'simulation-reset', args: {} }
  await runClientCommand(_clientSocket, cmdObj)
}
