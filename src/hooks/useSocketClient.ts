import { io } from 'socket.io-client'

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
  debugger
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
