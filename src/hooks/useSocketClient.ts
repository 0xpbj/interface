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
const runClientCommand = async (clientSocket: Socket | undefined, cmdObj: any, timeOutMs = 10000) => {
  if (!clientSocket) {
    log.error(
      'No connection to server. Socket undefined. ' + 'Unable to run command:\n' + JSON.stringify(cmdObj, null, 2)
    )
    return
  }

  if (cmdObj.executed) {
    log.error(
      `Command executed already! A new command and id must be created. Ignoring!\n` +
        `Command object:\n${JSON.stringify(cmdObj, null, 2)}`
    )
    return
  }

  clientSocket.emit('client-command', cmdObj)
  cmdObj.executed = true

  await new Promise((resolve, reject) => {
    const timeOut = { ignore: false }

    const exitFn = (reason: string) => {
      timeOut.ignore = true
      reject(
        `runCommand failed eth node server connection, while running:\n` +
          JSON.stringify(cmdObj, null, 2) +
          `\nbecause: ${reason}.\n`
      )
    }
    clientSocket.once('disconnect', exitFn)

    clientSocket.once('result', (obj: any) => {
      timeOut.ignore = true
      clientSocket.removeListener('disconnect', exitFn)

      if (obj && obj.result && obj.result.id === cmdObj.id) {
        log.debug(`Command ${cmdObj.command} succeeded.`)
        resolve(null)
      } else {
        reject(
          `Failed to get expected acknowledgement of command ${cmdObj.command}. ` +
            `Expected command id ${cmdObj.id}, received response: ` +
            `${JSON.stringify(obj, null, 2)}`
        )
      }
    })

    // Time-out logic.  Issue a warning, clear the listener and resolve this promise:
    //
    setTimeout(() => {
      if (!timeOut.ignore) {
        clientSocket.removeAllListeners('result')
        clientSocket.removeListener('disconnect', exitFn)
        reject(
          `runClientCommand timed out after ${timeOutMs / 1000} seconds, while running:\n` +
            JSON.stringify(cmdObj, null, 2)
        )
      }
    }, timeOutMs)
  })
}

type CommandType = {
  id: number
  command: string
  args?: any
}

let transactionsData = []

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
    transactionsData.push(statusObj)
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

export const initSimulator = async (): Promise<void> => {
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

export const play = async (
  tokenA: number,
  tokenB: number,
  numIntervals: number,
  blockInterval: number,
  simulateArbitrage: boolean,
  marketReserves: boolean,
  marketData: boolean
  ): Promise<void> => {
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
      simulateArbitrage,
      marketReserves, // Use real reserves to start
      marketData,
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
  transactionsData = []
  const cmdObj = { id: _cmdId++, command: 'simulation-reset', args: {} }
  await runClientCommand(_clientSocket, cmdObj)
}
