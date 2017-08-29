const spawn = require('child_process').spawn
const commandExists = require('command-exists')
const getPort = require('./get-port')
const callStable = require('./call-stable')
const Emitter = require('events')

const DEF_OPTS = {
  bin: false,
  host: '0.0.0.0',
  port: 35410,
  root: process.cwd(),
  verbose: false,
  quiet: false,
  autorestart: true
}

function server (opts) {
  opts = Object.assign({}, DEF_OPTS, opts || {})

  let closed = false
  let started = false
  let handler

  const api = new Emitter()
  const restart = callStable(start, () => handleError('Php built-in server closes too often.'))

  api.start = opts.autorestart ? restart : start
  api.close = close
  api.isStarted = function () { return started }

  return api

  function log (msg, force) {
    if ((!opts.verbose && !force) || opts.quiet) return
    process.stdout.write('[PHP] ' + msg)
  }

  function handleOut (data) {
    if (closed && !started) return
    if (closed) return close()
    log(data)
  }

  function handleError (data) {
    handleOut(data)
    api.emit('error', data.toString('utf8').trim())
  }

  function startProcess () {
    return new Promise((resolve, reject) => {
      getPort(opts.port)
        .then(resolvedPort => {
          if (closed) {
            close()
            resolve()
          }
          const addr = opts.host + ':' + resolvedPort

          handler = spawn('php', ['-S', addr, '-t', opts.root])

          handler.stdout.on('data', handleOut)
          handler.stderr.on('data', handleOut)
          handler.on('close', close)

          started = true
          log('Server started on ' + opts.host + ':' + resolvedPort + '\n')
          api.emit('start', { host: opts.host, port: resolvedPort })
        })
        .catch(reject)
    })
  }

  function start () {
    closed = false
    if (started) return

    commandExists('php')
      .catch(() => Promise.reject(new Error('php is not installed on your system.')))
      .then(() => startProcess())
      .catch(err => handleError(err))
  }

  function close (code) {
    code = code !== undefined ? code : 0
    closed = true
    if (!handler || !started) return
    started = false
    handler.kill()
    handler.removeAllListeners()
    log('Server closed.\n')
    api.emit('close', { code: code })
    if (opts.autorestart) restart()
  }
}

module.exports = server