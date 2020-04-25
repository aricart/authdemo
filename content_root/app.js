class App {
  constructor () {
    this.nc = null
    this.uc = new UserContext()
    this.avatars = new Avatars()
  }

  // this function starts the connection - however we have to wait until
  // authentication is completed - authOK() calls this once we know who we are.
  run () {
    nats.connect({
      url: this.uc.getServerURL(),
      noEcho: true,
      jwt: this.uc.getJWT(),
      name: this.uc.getName(),
      payload: nats.Payload.JSON
    }).then((nc) => {
      this.nc = nc
      this.setupHandlers(nc)
      // setup our avatar
      this.avatars.enter(this.uc.me())
      this.avatars.setMyAvatar(this.uc.getID(), `Connected as ${this.uc.getID()} to ${nc.options.url}`)
      // tell everyone we are here
      nc.publish(`${this.uc.getPrefix()}.entered`, this.uc.me())
      this.discover()
    }).catch((err) => {
      console.error('error connecting', err)
      setTimeout(() => {
        location.reload()
      }, 5000)
    })
  }

  // return true if we are connected to NATS
  isConnected () {
    return this.nc && !this.nc.isClosed()
  }

  // disconnect from NATS, if we are connected, this will notify that we are exiting
  async disconnect () {
    if (this.isConnected()) {
      this.nc.publish(`user.${this.uc.getID()}.exited`)
      await this.nc.flush(() => {
        this.nc.close()
        this.nc = null
      })
    }
  }

  // setup our handlers
  setupHandlers (nc) {
    // handle errors
    nc.addEventListener('error', (err) => {
      console.log(`error: ${err.toString()}`)
      setTimeout(() => {
        location.reload()
      }, 1000)
    })

    // handle close
    nc.addEventListener('close', () => {
      console.log('connection closed')
      setTimeout(() => {
        location.reload()
      }, 1000)
    })

    // answer any queries for who is here
    nc.subscribe('user.who', (_, m) => {
      m.respond(this.uc.me())
    })

    // subscribe to user entered notifications
    nc.subscribe('user.*.entered', (_, m) => {
      this.avatars.enter(m.data)
    })

    // subscribe to user exited notifications
    nc.subscribe('user.*.exited', (_, m) => {
      const chunks = m.subject.split('.')
      this.avatars.exit(chunks[1])
    })

    nc.subscribe('user.*.active', (_, m) => {
      const chunks = m.subject.split('.')
      this.avatars.active(chunks[1])
    })
  }

  moved() {
    this.avatars.active(this.uc.getID())
    this.nc.publish(`user.${this.uc.getID()}.active`, null)
  }

  // find out who is all here
  async discover () {
    // create a subscription to handle the request for a list of users
    // normally we would simply perform a `request()`, but in this case
    // we are interested in receiving all replies for who is out there
    // not just the first that answers
    const inbox = `_inbox.user.${nats.nuid.next()}`
    let drain
    const sub = await this.nc.subscribe(inbox, (_, m) => {
      this.avatars.enter(m.data)
      if (!drain) {
        // create a debounced version of subscription.drain() that will be called
        // after a 500 ms interval where we don't get new messages
        drain = debounce(() => {
          sub.drain()
        }, 1000)
      }
      drain()
    })
    // publish the message to find out who is here with the reply inbox
    this.nc.publish('user.who', '', inbox)
    // send it to the server now
    this.nc.flush()
  }
}
