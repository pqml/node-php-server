const fs = require('fs-extra')
const path = require('path')
const spawn = require('child_process').spawn
const commandExists = require('command-exists')
const getPort = require('./get-port')
const callStable = require('./call-stable')
const Emitter = require('events')
const shColors = require('kool-shell/utils/colors')
const sh = require('kool-shell')()
  .use(require('kool-shell/plugins/log'), {
    infoPrefix: '[PHP] ',
    errorPrefix: '[PHP] ' + shColors.red('Error: ')
  })
  .use(require('kool-shell/plugins/exec'))
  .use(require('kool-shell/plugins/input'))

const CACHEPATH = path.join(__dirname, '..', '.bincache')

const DEF_OPTS = {
  bin: 'php',
  promptBinary: false,
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
  const restart = callStable(start, () => error('Php built-in server closes too often.'))

  api.start = opts.autorestart ? restart : start
  api.close = close
  api.isStarted = function () { return started }

  return api

  function log (msg = '', force) {
    if ((!opts.verbose && !force) || opts.quiet) return
    sh.log(msg.toString('utf8').trim())
  }

  function error (msg = '', force) {
    msg = msg.toString('utf8').trim()
    api.emit('error', msg)
    if ((!opts.verbose && !force) || opts.quiet) return
    sh.error(msg)
  }

  function handleOut (data = '') {
    if (closed && !started) return
    if (closed) return close()
    log(data)
  }

  function writeBin (bin) {
    let filepath = bin
    Promise.resolve()
      .then(() => new Promise(resolve => {
        fs.pathExists(filepath, (err, exists) => {
          if (err) return resolve()
          if (exists && !path.isAbsolute(filepath)) {
            const absPath = path.join(process.cwd(), filepath)
            validateBinary(absPath)
              .then(() => { filepath = absPath })
              .then(resolve)
              .catch(resolve)
          } else resolve()
        })
      }))
      .then(() => fs.ensureFile(CACHEPATH))
      .then(() => fs.writeFile(CACHEPATH, filepath))
      .catch(err => {})
  }

  function validateBinary (bin) {
    return new Promise((resolve, reject) => {
      bin = bin.toString().trim();
      Promise.resolve()
        .then(() => { if (bin === '') reject('Empty path') })
        .then(() => commandExists(bin)).catch(err => reject(bin + ' doesn\'t exist'))
        .then(() => checkPhp(bin)).catch(err => reject(bin + ' is not a php binary.'))
        .then(() => resolve(bin))
    })
  }

  function checkPhp (bin) {
    return new Promise((resolve, reject) => {
      sh.silentExec(bin, ['-v'])
        .then(out => {
          const log = out.stdout.trim()
          if (log.startsWith('PHP') || log.startsWith('php')) resolve()
          else return Promise.reject()
        })
        .catch(reject)
    })
  }

  function promptPhp () {
    return sh.input('Valid path or command for php:', {
      onSubmit: path => new Promise((resolve, reject) => {
        validateBinary(path)
          .then(bin => resolve(bin))
          .catch(err => sh.error(err) && promptPhp().then(bin => resolve(bin)))
      })
    })
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

          handler = spawn(opts.bin, ['-S', addr, '-t', opts.root])

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

    validateBinary(opts.bin)
      .catch(err => {
        return new Promise((resolve, reject) => {
          Promise.resolve()
            .then(() => fs.ensureFile(CACHEPATH))
            .then(() => fs.readFile(CACHEPATH))
            .then(res => res.toString().trim() === '' ? reject(err) : res)
            .then(bin => validateBinary(bin))
            .then(bin => { opts.bin = bin })
            .then(resolve)
            .catch(reject)
        })
      })
      .catch(err => {
        sh.error(err)
        if (!opts.promptBinary) return Promise.reject()
        return new Promise(resolve =>
          promptPhp()
            .then(bin => { opts.bin = bin })
            .then(() => writeBin(opts.bin))
            .then(resolve)
        )
      })
      .then(() => startProcess())
      .catch(err => error(err))
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