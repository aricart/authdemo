// authentication jwt - added by the server
const jwt = '{{cjwt}}'
const prefix = '{{prefix}}'

// add an entry to the document
function addEntry (s) {
  const p = document.createElement('pre')
  p.appendChild(document.createTextNode(s))
  document.getElementById('log').appendChild(p)
}

async function run() {
  const id = nats.nuid.next()

  nats.connect({url: '{{ws_server_url}}', noEcho: true, userJwt: jwt})
    .then(async (nc) => {
      addEntry(`connected as ${id} to ${nc.options.url}`)

      // handle errors
      nc.addEventListener('error', (err) => {
        addEntry(`error: ${err.toString()}`)
        addEntry(`reloading in 1s`)
        setTimeout(() => {
          location.reload()
        }, 1000)
      })

      // handle close
      nc.addEventListener('close', () => {
        addEntry(`connection closed`)
        addEntry(`will attempt to reconnect in 1s`)
        setTimeout(() => {
          location.reload()
        }, 1000)
      })

      nc.subscribe('who', () => {
          nc.publish('here', id)
      })

      let i = 0
      nc.subscribe('>', (m) => {
        i++
        addEntry(`[${i}] ${m.subject}: ${m.data}`)
      })
      await nc.flush()

      nc.publish(`${prefix}.entered`
          , id)
      nc.publish('who')
    })
    .catch((err) => {
      addEntry(`error connecting: ${err.toString()}`)
      addEntry(`will reload in 1000`)
      setTimeout(() => {
        location.reload()
      }, 1000)
    })
}
run()
