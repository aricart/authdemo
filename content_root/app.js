const uc = new UserContext()
const avatars = new Avatars()

let nc
function isConnected() {
  return nc && !nc.isClosed()
}
function disconnectNATS () {
  if (isConnected()) {
    nc.publish(`user.${uc.getID()}.exited`)
    nc.flush().then(() => {
      nc.close()
      nc = null
    })
  }
}

async function run () {
  nats.connect({ url: uc.getServerURL(),
    noEcho: true,
    userJwt: uc.getJWT(),
    name: uc.getName()
  })
    .then(async (conn) => {
      nc = conn

      avatars.enter(JSON.stringify(uc.me()))
      avatars.setMyAvatar(uc.getID(), `Connected as ${uc.getID()} to ${nc.options.url}`)

      // handle errors
      nc.addEventListener('error', (err) => {
        console.log(`error: ${err.toString()}`)
        setTimeout(() => {
          location.reload()
        }, 1000)
      })

      // handle close
      nc.addEventListener('close', () => {
        console.log(`connection closed`)
        setTimeout(() => {
          location.reload()
        }, 1000)
      })

      // answer any queries for who is here
      nc.subscribe('user.who', (m) => {
        m.respond(JSON.stringify(uc.me()))
      })

      nc.subscribe('user.*.entered', (m) => {
        avatars.enter(m.data)
      })

      nc.subscribe('user.*.exited', (m) => {
        const chunks = m.subject.split('.')
        avatars.exit(chunks[1])
      })

      // create a subscription to handle the request for a list of users
      const inbox = nats.nuid.next()
      const hereSub = await nc.subscribe(inbox, (m) => {
        avatars.enter(m.data)
      })

      await nc.flush()

      // tell everyone we are here
      nc.publish(`${uc.getPrefix()}.entered`, JSON.stringify(uc.me()))
      // request to find out who is here
      nc.publish('user.who', '', inbox)
      setTimeout(() => {
        hereSub.drain()
      }, 5000)
    })
    .catch((err) => {
      console.error('error connecting', err)
      setTimeout(() => {
        location.reload()
      }, 5000)
    })
}
