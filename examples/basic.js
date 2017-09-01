const php = require('..')
const server = php({
  host: '127.0.0.1',
  bin: 'invalidbin',
  promptBinary: true,
  verbose: true
})

server.on('start', data => {
  console.log('Server started on http://' + data.host + ':' + data.port)
})

server.on('error', err => {
  console.log(err)
})

server.start()
